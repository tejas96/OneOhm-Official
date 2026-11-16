import { Inject, Injectable, Logger } from '@nestjs/common';
import { dutyPoints, siteVisits } from '@oneohm/database';
import {
  type DutySite,
  type OpenRouteVisit,
  type RouteVisitAction,
  type RouteVisitPoint,
  routeVisitActions,
  zonedInstant,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gte } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { AppError } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { ServiceVisitsService } from '../service-visits/service-visits.service';
import { loadPolicy } from '../workforce/policy';
import { dutySitesFor } from './duty-sites.service';
import { sitePointOf } from './site-visit-end';
import { SiteVisitsService } from './site-visits.service';

type VisitRow = typeof siteVisits.$inferSelect;
interface Here {
  readonly id: string;
  readonly service: boolean;
}

const jobOf = (row: VisitRow): Here | null =>
  row.taskId
    ? { id: row.taskId, service: false }
    : row.serviceRequestId
      ? { id: row.serviceRequestId, service: true }
      : null;

/** When each job's visit closed today, and the latest of them. */
function closures(visits: readonly VisitRow[]) {
  const closedBySite = new Map<string, Date>();
  let closedAt: Date | null = null;
  for (const visit of visits) {
    if (!visit.checkOutAt) continue;
    const id = jobOf(visit)?.id;
    if (id && (closedBySite.get(id) ?? 0) < visit.checkOutAt)
      closedBySite.set(id, visit.checkOutAt);
    if (!closedAt || closedAt < visit.checkOutAt) closedAt = visit.checkOutAt;
  }
  return { closedBySite, closedAt };
}

/**
 * The route backstop for the phone's site fence (Duty Day step 3): after a batch of route
 * points is saved, the person's points of the day say whether they arrived at or left one of
 * today's sites, and the visit is checked in or out at the time of that point. The phone and
 * the route may see the same arrival; the check-in and check-out ignore the second. A step
 * that cannot be made (an open visit elsewhere, the day closed, no consent) stops the rest
 * and never fails the upload.
 */
@Injectable()
export class RouteVisitsService {
  private readonly log = new Logger('RouteVisits');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly taskVisits: SiteVisitsService,
    private readonly serviceVisits: ServiceVisitsService,
  ) {}

  async afterPoints(actor: Actor, now: Date = new Date()): Promise<void> {
    try {
      await this.run(actor, now);
    } catch (error) {
      this.log.warn(`Route visits for ${actor.userId} were skipped: ${String(error)}`);
    }
  }

  private async run(actor: Actor, now: Date): Promise<void> {
    const { travel } = await loadPolicy(this.db);
    // Off in Settings: the route neither checks anyone in nor out.
    if (!travel.autoSiteVisits) return;
    const timeZone = currentCalendar().timeZone;
    const today = todayIn(timeZone, now);
    const sites = await dutySitesFor(this.db, actor.userId, today);
    const visits = await this.db
      .select()
      .from(siteVisits)
      .where(and(eq(siteVisits.userId, actor.userId), eq(siteVisits.workDate, today)));
    const openRow = visits.find((visit) => visit.checkOutAt === null) ?? null;
    // With no site to arrive at and nothing open, the route has nothing to say.
    if (sites.length === 0 && !openRow) return;
    const points = await this.pointsOf(actor.userId, zonedInstant(today, 0, timeZone));
    const { closedAt, closedBySite } = closures(visits);
    const radiusM = travel.siteFenceM;
    const open: OpenRouteVisit | null = openRow
      ? {
          siteId: jobOf(openRow)?.id ?? null,
          checkInAt: openRow.checkInAt,
          site: await sitePointOf(this.db, openRow.propertyId),
          radiusM,
        }
      : null;
    const actions = routeVisitActions({ points, sites, open, closedAt, closedBySite });
    let here: Here | null = openRow ? jobOf(openRow) : null;
    for (const action of actions) {
      try {
        here = await this.apply(actor, action, here, points);
      } catch (error) {
        // An arrival or departure older than two hours is the person's to enter by hand; the
        // route goes on to what came after it instead of stopping on it every upload.
        if (error instanceof AppError && error.code === 'auto_event_too_old') {
          this.log.log(`Route visit step for ${actor.userId} was too old and skipped.`);
          continue;
        }
        this.log.log(`Route visit step for ${actor.userId} stopped: ${String(error)}`);
        return;
      }
    }
  }

  /** The person's route points since `from`, in time order. */
  private async pointsOf(userId: string, from: Date): Promise<RouteVisitPoint[]> {
    const rows = await this.db
      .select()
      .from(dutyPoints)
      .where(and(eq(dutyPoints.userId, userId), gte(dutyPoints.recordedAt, from)))
      .orderBy(asc(dutyPoints.recordedAt));
    return rows.map((row) => ({
      recordedAt: row.recordedAt,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyM: row.accuracyM,
      mocked: row.mocked,
    }));
  }

  /** One arrival or departure; returns where the person is afterwards. */
  private async apply(
    actor: Actor,
    action: RouteVisitAction,
    here: Here | null,
    points: readonly RouteVisitPoint[],
  ): Promise<Here | null> {
    const point = points.find((one) => one.recordedAt.getTime() === action.at.getTime());
    const position = point
      ? { latitude: point.latitude, longitude: point.longitude, accuracyM: point.accuracyM }
      : null;
    const auto = {
      source: 'auto_route' as const,
      tappedAt: action.at.toISOString(),
      mocked: false,
    };
    if (action.kind === 'check_in') {
      const site: DutySite = action.site;
      const made =
        site.kind === 'service'
          ? await this.serviceVisits.checkIn(actor, site.id, position, auto)
          : await this.taskVisits.checkIn(actor, site.id, position, auto);
      // Left alone (still at a site just left, or between two sites): no visit was made.
      return made.autoSkipped ? here : { id: site.id, service: site.kind === 'service' };
    }
    if (!here) return null;
    if (here.service) await this.serviceVisits.checkOut(actor, here.id, position, auto);
    else await this.taskVisits.checkOut(actor, here.id, position, auto);
    return null;
  }
}
