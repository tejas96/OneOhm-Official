import { Inject, Injectable } from '@nestjs/common';
import type {
  ServiceFieldWork,
  ServiceJob,
  ServiceTicket,
  ServiceVisit,
} from '@oneohm/api-contracts';
import { serviceRequests, siteVisits } from '@oneohm/database';
import { byUrgency, type CheckOutSource, checkInChanges } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, ne, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { conflict, forbidden, notFound } from '../../common/http/errors';
import { serviceRequestRows, toTicket } from '../../common/read-models/service-request-rows';
import { DATABASE, type Database } from '../../config/core.module';
import { plannedVisitFor } from '../site-activity/planned-visit';
import { type AutoVisit, alreadyVisiting, visitMoment } from '../site-activity/site-visit-auto';
import { leftVisitOf } from '../site-activity/site-visit-left';
import { autoCheckInSkip } from '../site-activity/site-visit-skip';
import { afterSiteCheckIn, assertDayNotClosed } from '../workforce/site-hooks';
import { type Position, trackingFor } from '../workforce/tracking';
import { closeServiceVisit, measureService } from './service-visit-close';
import { noteServiceCheckIn, tellCustomer } from './service-visit-events';
import { fieldWorkOf, openVisitOf, placesOf, type ServicePlace, toJob } from './service-visit-read';

export interface LoadedJob {
  readonly ticket: ServiceTicket;
  readonly request: typeof serviceRequests.$inferSelect;
  readonly place: ServicePlace | undefined;
  readonly assigneeUserId: string | null;
  /** How the customer names the problem, for their WhatsApp updates. */
  readonly topic: string;
}

const rounded = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Math.round(value);

/**
 * Service visits from the field app (PRD 5.5): the technician's open requests, checking
 * in and out at the customer's site with the same consent and distance rules as task
 * visits (a far check-in is flagged, never refused), and the work so far.
 */
@Injectable()
export class ServiceVisitsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async mine(actor: Actor): Promise<ServiceJob[]> {
    const rows = await serviceRequestRows(
      this.db,
      and(
        eq(serviceRequests.assigneeUserId, actor.userId),
        ne(serviceRequests.status, 'resolved'),
      ) as SQL,
    );
    const now = new Date();
    const tickets = rows.map((row) => toTicket(row, now));
    const [places, open] = await Promise.all([
      placesOf(this.db, tickets),
      openVisitOf(this.db, actor.userId),
    ]);
    return tickets.map((ticket) => toJob(ticket, places.get(ticket.id), open)).sort(byUrgency);
  }

  /**
   * A request with its site, for its assignee or the service team. `checked`: access was
   * settled already (the person just handed it back and is no longer its assignee).
   */
  async load(actor: Actor, id: string, checked = false): Promise<LoadedJob> {
    const [row] = await serviceRequestRows(this.db, eq(serviceRequests.id, id));
    if (!row) throw notFound('That service request');
    const mine = row.request.assigneeUserId === actor.userId;
    if (!checked && !mine && !can(actor, 'service.manage')) throw forbidden();
    const ticket = toTicket(row, new Date());
    const places = await placesOf(this.db, [ticket]);
    return {
      ticket,
      request: row.request,
      place: places.get(ticket.id),
      assigneeUserId: row.request.assigneeUserId,
      topic: (row.customerLabel ?? row.label ?? 'your request').toLowerCase(),
    };
  }

  /** Only the person the request is given to works it in the field, until it is resolved. */
  async ownJob(actor: Actor, id: string): Promise<LoadedJob> {
    const job = await this.load(actor, id);
    if (job.assigneeUserId !== actor.userId)
      throw forbidden('Only the person this request is given to can work on it.');
    if (job.ticket.status === 'resolved')
      throw conflict('This request is already resolved.', 'resolved');
    return job;
  }

  async detail(actor: Actor, id: string, checked = false): Promise<ServiceVisit> {
    const job = await this.load(actor, id, checked);
    const [tracking, open, work, justLeft] = await Promise.all([
      trackingFor(this.db, actor.userId),
      openVisitOf(this.db, actor.userId),
      fieldWorkOf(this.db, id),
      leftVisitOf(this.db, actor.userId, { serviceRequestId: id }),
    ]);
    return {
      ...toJob(job.ticket, job.place, open),
      ...work,
      customerPhotos: job.ticket.photos,
      customerMedia: job.ticket.media,
      openVisit: open,
      tracking: tracking.status,
      farFromSiteM: tracking.policy.travel.farFromSiteM,
      sitePoint: job.place?.point ?? null,
      canWork: job.assigneeUserId === actor.userId && job.ticket.status !== 'resolved',
      justLeft,
    };
  }

  /** The field side of a request, for the desk. */
  async fieldWork(id: string): Promise<ServiceFieldWork> {
    const [row] = await this.db
      .select({ id: serviceRequests.id })
      .from(serviceRequests)
      .where(eq(serviceRequests.id, id));
    if (!row) throw notFound('That service request');
    return fieldWorkOf(this.db, id);
  }

  measure(actor: Actor, place: ServicePlace | undefined, position?: Position | null, at?: Date) {
    return measureService(this.db, actor, place, position, at);
  }

  async checkIn(
    actor: Actor,
    id: string,
    position?: Position | null,
    auto?: AutoVisit,
  ): Promise<ServiceVisit> {
    const job = await this.ownJob(actor, id);
    const { at: now, source, delayed } = await visitMoment(this.db, actor, auto, new Date(), 'in');
    // The same arrival twice (the phone and the route) is one visit.
    if (auto && (await alreadyVisiting(this.db, actor.userId, { serviceRequestId: id }, now)))
      return this.detail(actor, id);
    if (auto) {
      const skipped = await autoCheckInSkip(
        this.db,
        actor.userId,
        { serviceRequestId: id },
        job.place?.point ?? null,
        position,
        now,
      );
      if (skipped) return { ...(await this.detail(actor, id)), autoSkipped: skipped };
    }
    const open = await openVisitOf(this.db, actor.userId);
    if (open)
      throw conflict(
        `You are still checked in for ${open.taskTitle ?? 'another visit'}. Check out there first.`,
        'open_visit',
      );
    const { reading, measured } = await this.measure(actor, job.place, position, now);
    const workDate = todayIn(currentCalendar().timeZone, now);
    await this.db.transaction(async (tx) => {
      await assertDayNotClosed(tx, actor.userId, workDate);
      const [created] = await tx
        .insert(siteVisits)
        .values({
          userId: actor.userId,
          projectId: job.ticket.project?.id ?? null,
          propertyId: job.place?.id ?? null,
          serviceRequestId: id,
          visitId: await plannedVisitFor(tx, { serviceRequestId: id }, workDate),
          kind: 'service',
          workDate,
          checkInAt: now,
          checkInSource: source,
          delayed,
          checkInLatitude: reading?.position.latitude ?? null,
          checkInLongitude: reading?.position.longitude ?? null,
          checkInAccuracyM: rounded(reading?.position.accuracyM),
          checkInDistanceM: measured?.distanceM ?? null,
          checkInFar: measured?.far ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: siteVisits.id });
      if (!created) throw conflict('You are already checked in somewhere.', 'open_visit');
      await afterSiteCheckIn(tx, actor, created.id, reading?.position ?? null, now, delayed);
      // Reaching the site answers the request, if nothing had answered it yet.
      const changes = checkInChanges(job.request, now);
      if (Object.keys(changes).length > 0) {
        await tx
          .update(serviceRequests)
          .set({ ...changes, updatedAt: now })
          .where(eq(serviceRequests.id, id));
      }
      // An automatic check-in answers the request but says nothing to the customer.
      if (changes.status && source === 'manual') await tellCustomer(tx, job, now);
      await noteServiceCheckIn(tx, job.ticket, {
        visitId: created.id,
        userId: actor.userId,
        fullName: actor.fullName,
        distanceM: measured?.distanceM ?? null,
        far: measured?.far ?? null,
        located: reading !== null,
        automatic: source !== 'manual',
      });
      await recordAudit(tx, actor.userId, 'service.checked_in', 'service_request', id, {
        visitId: created.id,
        distanceM: measured?.distanceM ?? null,
        far: measured?.far ?? null,
      });
    });
    return this.detail(actor, id);
  }

  async checkOut(
    actor: Actor,
    id: string,
    position?: Position | null,
    auto?: AutoVisit,
  ): Promise<ServiceVisit> {
    const job = await this.ownJob(actor, id);
    const closed = await this.closeVisit(actor, job, position, auto);
    // The same departure seen twice is not an error for the phone or the route.
    if (!closed && !(auto && auto.source !== 'manual'))
      throw conflict('You are not checked in at this site.', 'not_checked_in');
    return this.detail(actor, id);
  }

  /** Checks the person out of their open visit on this request: its id, or null if none. */
  closeVisit(
    actor: Actor,
    job: LoadedJob,
    position?: Position | null,
    auto?: AutoVisit,
    finished?: CheckOutSource,
  ): Promise<string | null> {
    return closeServiceVisit(this.db, actor, job, position, auto, finished);
  }
}
