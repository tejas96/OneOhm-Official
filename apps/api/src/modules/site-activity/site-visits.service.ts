import { Inject, Injectable } from '@nestjs/common';
import type { SiteVisit, TaskSite } from '@oneohm/api-contracts';
import { properties, siteVisits } from '@oneohm/database';
import { type GeoPoint, locationChange, siteDistance } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { afterSiteCheckIn, afterSiteCheckOut } from '../workforce/site-hooks';
import { type Position, trackingFor, usableReading } from '../workforce/tracking';
import { SitePinService } from './site-pin.service';
import { loadSiteTask, type SiteTask } from './site-task';
import { noteCheckIn, noteCheckOut, noteSiteSaved } from './site-visit-events';
import { checkInPoint, readVisits, visitRecords } from './site-visit-read';

const accuracy = (position: Position) =>
  position.accuracyM === null || position.accuracyM === undefined
    ? null
    : Math.round(position.accuracyM);

/**
 * Checking in and out at the customer's site on a task (PRD 4.2, 4.3). The phone's
 * location is kept only with consent during working hours; a check-in far from the
 * site is flagged for the manager and never refused.
 */
@Injectable()
export class SiteVisitsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pins: SitePinService,
  ) {}

  async taskSite(actor: Actor, taskId: string): Promise<TaskSite> {
    const task = await loadSiteTask(this.db, actor, taskId);
    return this.present(actor, task);
  }

  async checkIn(actor: Actor, taskId: string, position?: Position | null): Promise<TaskSite> {
    const task = await this.ownSiteTask(actor, taskId);
    if (task.status === 'completed') throw conflict('This task is already complete.', 'completed');
    const [open] = await visitRecords(
      this.db,
      and(eq(siteVisits.userId, actor.userId), isNull(siteVisits.checkOutAt)) as SQL,
    );
    if (open)
      throw conflict(
        `You are still checked in for ${open.taskTitle ?? 'another visit'}. Check out there first.`,
        'open_visit',
      );
    const now = new Date();
    const reading = await usableReading(this.db, actor.userId, position, now);
    const radius = reading?.policy.travel.farFromSiteM ?? 0;
    const measured = reading ? siteDistance(reading.position, task.site, radius) : null;
    const [created] = await this.db
      .insert(siteVisits)
      .values({
        userId: actor.userId,
        taskId: task.id,
        projectId: task.projectId,
        propertyId: task.propertyId,
        kind: task.kind ?? 'installation',
        workDate: todayIn('Asia/Kolkata', now),
        checkInAt: now,
        checkInLatitude: reading?.position.latitude ?? null,
        checkInLongitude: reading?.position.longitude ?? null,
        checkInAccuracyM: reading ? accuracy(reading.position) : null,
        checkInDistanceM: measured?.distanceM ?? null,
        checkInFar: measured?.far ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: siteVisits.id });
    if (!created) throw conflict('You are already checked in somewhere.', 'open_visit');
    await afterSiteCheckIn(this.db, actor, created.id, reading?.position ?? null, now);
    await noteCheckIn(this.db, task, {
      visitId: created.id,
      userId: actor.userId,
      fullName: actor.fullName,
      distanceM: measured?.distanceM ?? null,
      far: measured?.far ?? null,
      located: reading !== null,
    });
    return this.present(actor, task);
  }

  async checkOut(actor: Actor, taskId: string, position?: Position | null): Promise<TaskSite> {
    const task = await this.ownSiteTask(actor, taskId);
    const open = await this.openVisitOn(actor, task.id);
    if (!open) throw conflict('You are not checked in at this site.', 'not_checked_in');
    const now = new Date();
    const reading = await usableReading(this.db, actor.userId, position, now);
    const radius = reading?.policy.travel.farFromSiteM ?? 0;
    const measured = reading ? siteDistance(reading.position, task.site, radius) : null;
    await this.db
      .update(siteVisits)
      .set({
        checkOutAt: now,
        checkOutLatitude: reading?.position.latitude ?? null,
        checkOutLongitude: reading?.position.longitude ?? null,
        checkOutAccuracyM: reading ? accuracy(reading.position) : null,
        checkOutDistanceM: measured?.distanceM ?? null,
        checkOutFar: measured?.far ?? null,
        updatedAt: now,
      })
      .where(and(eq(siteVisits.id, open.id), isNull(siteVisits.checkOutAt)));
    await afterSiteCheckOut(this.db, actor.userId, open.id, reading?.position ?? null);
    await noteCheckOut(this.db, task, {
      visitId: open.id,
      userId: actor.userId,
      fullName: actor.fullName,
      distanceM: measured?.distanceM ?? null,
      far: measured?.far ?? null,
      located: reading !== null,
      minutes: Math.max(0, Math.round((now.getTime() - open.checkInAt.getTime()) / 60_000)),
    });
    return this.present(actor, task);
  }

  /**
   * The person at the site sets the site's location: the roof they pinned on the map, or
   * (older apps, no map) their check-in reading, which only fills an empty location.
   * Later check-ins are measured against it.
   */
  async saveSiteLocation(actor: Actor, taskId: string, pin?: GeoPoint): Promise<TaskSite> {
    const task = await this.ownSiteTask(actor, taskId);
    const open = await this.openVisitOn(actor, task.id);
    if (pin) {
      if (!open) throw invalid('Check in at this site first.');
      await this.pins.pin(actor, task, open, pin);
      return this.taskSite(actor, taskId);
    }
    if (locationChange({ point: task.site, source: task.siteSource }, 'gps') === 'ask')
      throw conflict('This site already has a saved location.', 'site_located');
    const point = open ? checkInPoint(open) : null;
    if (!open || !point)
      throw invalid('Check in here with your location shared first.', { position: 'Missing.' });
    await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(properties)
        .set({
          latitude: point.latitude,
          longitude: point.longitude,
          locationSource: 'gps',
          locationAccuracyM: open.checkInAccuracyM,
          locatedAt: now,
          locatedByUserId: actor.userId,
          locationFlagged: false,
          locationFlagDistanceM: null,
          updatedAt: now,
        })
        .where(and(eq(properties.id, task.propertyId), isNull(properties.latitude)));
      await tx
        .update(siteVisits)
        .set({ checkInDistanceM: 0, checkInFar: false, updatedAt: now })
        .where(eq(siteVisits.id, open.id));
      await recordAudit(tx, actor.userId, 'property.located', 'property', task.propertyId, {
        source: 'gps',
        fromVisit: open.id,
        accuracyM: open.checkInAccuracyM,
      });
      await noteSiteSaved(tx, task, actor.userId);
    });
    return this.taskSite(actor, taskId);
  }

  async projectVisits(projectId: string): Promise<SiteVisit[]> {
    return visitRecords(this.db, eq(siteVisits.projectId, projectId));
  }

  /** Only the person doing a site task checks in at its site. */
  private async ownSiteTask(actor: Actor, taskId: string): Promise<SiteTask> {
    const task = await loadSiteTask(this.db, actor, taskId);
    if (!task.kind) throw invalid('This task is not done at the site.', { taskId: 'Office work.' });
    if (task.assigneeUserId !== actor.userId)
      throw forbidden('Only the person doing this task checks in at its site.');
    return task;
  }

  private async openVisitOn(actor: Actor, taskId: string) {
    const [open] = await this.db
      .select()
      .from(siteVisits)
      .where(
        and(
          eq(siteVisits.userId, actor.userId),
          eq(siteVisits.taskId, taskId),
          isNull(siteVisits.checkOutAt),
        ),
      )
      .limit(1);
    return open ?? null;
  }

  private async present(actor: Actor, task: SiteTask): Promise<TaskSite> {
    const [tracking, visits, mine] = await Promise.all([
      trackingFor(this.db, actor.userId),
      readVisits(this.db, eq(siteVisits.taskId, task.id)),
      visitRecords(
        this.db,
        and(eq(siteVisits.userId, actor.userId), isNull(siteVisits.checkOutAt)) as SQL,
      ),
    ]);
    const openHere = visits.find(
      (item) => item.row.userId === actor.userId && item.row.checkOutAt === null,
    );
    return {
      taskId: task.id,
      kind: task.kind,
      siteLabel: task.siteLabel,
      siteAddress: task.siteAddress,
      siteLocated: task.site !== null,
      farFromSiteM: tracking.policy.travel.farFromSiteM,
      openVisit: mine[0] ?? null,
      visits: visits.map((item) => item.record),
      tracking: tracking.status,
      canSetSite:
        task.site === null &&
        task.assigneeUserId === actor.userId &&
        Boolean(openHere && checkInPoint(openHere.row)),
      sitePoint: task.site,
      siteFlagged: task.siteFlagged,
      canPinSite: task.assigneeUserId === actor.userId && Boolean(openHere),
    };
  }
}
