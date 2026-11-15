import { Inject, Injectable } from '@nestjs/common';
import type { SiteVisit, TaskSite } from '@oneohm/api-contracts';
import { type DatabaseExecutor, properties, siteVisits } from '@oneohm/database';
import { type GeoPoint, locationChange, siteDistance } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { afterSiteCheckIn, assertDayNotClosed } from '../workforce/site-hooks';
import { type Position, trackingFor, usableReading } from '../workforce/tracking';
import { plannedVisitFor } from './planned-visit';
import { SitePinService } from './site-pin.service';
import { loadSiteTask, readSiteTask, type SiteTask } from './site-task';
import { accuracy, endOwnVisit, oneVisitRecord, sitePointOf } from './site-visit-end';
import { noteCheckIn, noteSiteSaved } from './site-visit-events';
import { forceCloseVisit } from './site-visit-force-close';
import { checkInPoint, readVisits, visitRecords } from './site-visit-read';

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
    const now = new Date();
    const reading = await usableReading(this.db, actor.userId, position, now);
    const radius = reading?.policy.travel.farFromSiteM ?? 0;
    const measured = reading ? siteDistance(reading.position, task.site, radius) : null;
    // One transaction (live review S7): a failure part way leaves no half-saved visit, and a
    // retry starts clean instead of finding an open visit with no history or attendance.
    await this.db.transaction(async (tx) => {
      const [open] = await visitRecords(
        tx,
        and(eq(siteVisits.userId, actor.userId), isNull(siteVisits.checkOutAt)) as SQL,
      );
      if (open)
        throw conflict(
          `You are still checked in for ${open.taskTitle ?? 'another visit'}. Check out there first.`,
          'open_visit',
        );
      const workDate = todayIn(currentCalendar().timeZone, now);
      await assertDayNotClosed(tx, actor.userId, workDate);
      const [created] = await tx
        .insert(siteVisits)
        .values({
          userId: actor.userId,
          taskId: task.id,
          projectId: task.projectId,
          propertyId: task.propertyId,
          visitId: await plannedVisitFor(tx, { taskId: task.id }, workDate),
          kind: task.kind ?? 'installation',
          workDate,
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
      await afterSiteCheckIn(tx, actor, created.id, reading?.position ?? null, now);
      await noteCheckIn(tx, task, {
        visitId: created.id,
        userId: actor.userId,
        fullName: actor.fullName,
        distanceM: measured?.distanceM ?? null,
        far: measured?.far ?? null,
        located: reading !== null,
      });
    });
    return this.present(actor, task);
  }

  async checkOut(actor: Actor, taskId: string, position?: Position | null): Promise<TaskSite> {
    const task = await this.ownSiteTask(actor, taskId);
    await endOwnVisit(this.db, actor, { task, site: task.site, position });
    return this.present(actor, task);
  }

  /**
   * The person ends their own open visit by its id (live review S1). It needs no task: it
   * works after the task was handed over, deleted or finished, or the request resolved, so
   * "You are still checked in for X" always has a way out.
   */
  async checkOutVisit(
    actor: Actor,
    visitId: string,
    position?: Position | null,
  ): Promise<SiteVisit> {
    const [row] = await this.db.select().from(siteVisits).where(eq(siteVisits.id, visitId));
    // Someone else's visit looks like no visit at all.
    if (!row || row.userId !== actor.userId) throw notFound('That visit');
    if (row.checkOutAt) throw conflict('You are not checked in at this site.', 'not_checked_in');
    const task = row.taskId ? await readSiteTask(this.db, row.taskId) : null;
    const site = task ? task.site : await sitePointOf(this.db, row.propertyId);
    await endOwnVisit(this.db, actor, { visitId, task, site, position });
    return oneVisitRecord(this.db, visitId);
  }

  /** A manager ends someone's stuck visit and says why (live review S1); see `forceCloseVisit`. */
  forceClose(actor: Actor, visitId: string, reason: string): Promise<SiteVisit> {
    return forceCloseVisit(this.db, actor, visitId, reason);
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

  private async openVisitOn(actor: Actor, taskId: string, db: DatabaseExecutor = this.db) {
    const [open] = await db
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
