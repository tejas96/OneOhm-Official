import { siteVisits } from '@oneohm/database';
import { type CheckOutSource, siteDistance, visitCloseAt } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import type { Database } from '../../config/core.module';
import { finishLinkedVisit } from '../site-activity/planned-visit';
import { type AutoVisit, visitMoment } from '../site-activity/site-visit-auto';
import { afterSiteCheckOut } from '../workforce/site-hooks';
import { type Position, usableReading } from '../workforce/tracking';
import { noteServiceCheckOut } from './service-visit-events';
import type { ServicePlace } from './service-visit-read';
import type { LoadedJob } from './service-visits.service';

const rounded = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Math.round(value);

/** The reading to keep at `at`, and how far it is from the request's site. */
export async function measureService(
  db: Database,
  actor: Actor,
  place: ServicePlace | undefined,
  position?: Position | null,
  at: Date = new Date(),
) {
  const reading = await usableReading(db, actor.userId, position, at);
  const radius = reading?.policy.travel.farFromSiteM ?? 0;
  const measured = reading ? siteDistance(reading.position, place?.point ?? null, radius) : null;
  return { reading, measured };
}

/**
 * Ends the person's open visit on a request, in one transaction: the check-out, the planned
 * visit marked done (S6) and the history note. `finished` names why when the work ended it
 * (marking it done); otherwise the source is the tap, the phone's fence or the route.
 * Returns the visit's id, or null when none was open.
 */
export async function closeServiceVisit(
  db: Database,
  actor: Actor,
  job: LoadedJob,
  position: Position | null | undefined,
  auto: AutoVisit | undefined,
  finished: CheckOutSource | undefined,
): Promise<string | null> {
  // Which visit is open is read outside to name the moment; the close itself re-reads the row
  // locked inside the transaction, so two closes at once (the phone and the route) make one.
  const [seen] = await db
    .select({ id: siteVisits.id })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.userId, actor.userId),
        eq(siteVisits.serviceRequestId, job.ticket.id),
        isNull(siteVisits.checkOutAt),
      ),
    )
    .limit(1);
  if (!seen) return null;
  const { at, source } = await visitMoment(db, actor, auto, new Date(), 'out');
  const { reading, measured } = await measureService(db, actor, job.place, position, at);
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select()
      .from(siteVisits)
      .where(and(eq(siteVisits.id, seen.id), isNull(siteVisits.checkOutAt)))
      .for('update');
    if (!open) return null;
    const now = visitCloseAt(open.checkInAt, at);
    const [closed] = await tx
      .update(siteVisits)
      .set({
        checkOutAt: now,
        checkOutSource: finished ?? source,
        checkOutLatitude: reading?.position.latitude ?? null,
        checkOutLongitude: reading?.position.longitude ?? null,
        checkOutAccuracyM: rounded(reading?.position.accuracyM),
        checkOutDistanceM: measured?.distanceM ?? null,
        checkOutFar: measured?.far ?? null,
        closeKind: 'self',
        updatedAt: now,
      })
      .where(and(eq(siteVisits.id, open.id), isNull(siteVisits.checkOutAt)))
      .returning({ id: siteVisits.id });
    // Someone else closed it first: nothing more to do, and no second history line.
    if (!closed) return null;
    await afterSiteCheckOut(tx, actor.userId, open.id, reading?.position ?? null);
    // The booked visit for this request is done once the person has left the site (S6).
    await finishLinkedVisit(tx, open.visitId, actor.userId, job.ticket.categoryLabel);
    await noteServiceCheckOut(tx, job.ticket, {
      visitId: open.id,
      userId: actor.userId,
      fullName: actor.fullName,
      distanceM: measured?.distanceM ?? null,
      far: measured?.far ?? null,
      located: reading !== null,
      minutes: Math.max(0, Math.round((now.getTime() - open.checkInAt.getTime()) / 60_000)),
      automatic: source !== 'manual',
    });
    return open.id;
  });
}
