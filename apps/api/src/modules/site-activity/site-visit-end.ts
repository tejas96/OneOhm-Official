import type { SiteVisit } from '@oneohm/api-contracts';
import { type DatabaseExecutor, properties, siteVisits, type Transaction } from '@oneohm/database';
import { type CheckInSource, type GeoPoint, siteDistance, visitCloseAt } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import { afterSiteCheckOut } from '../workforce/site-hooks';
import { type Position, usableReading } from '../workforce/tracking';
import { finishLinkedVisit } from './planned-visit';
import type { SiteTask } from './site-task';
import { type AutoVisit, visitMoment } from './site-visit-auto';
import { noteCheckOut, noteVisitEnded } from './site-visit-events';
import { distanceWords, visitRecords } from './site-visit-read';

type VisitRow = typeof siteVisits.$inferSelect;

export const accuracy = (position: Position) =>
  position.accuracyM === null || position.accuracyM === undefined
    ? null
    : Math.round(position.accuracyM);

export async function oneVisitRecord(db: DatabaseExecutor, visitId: string): Promise<SiteVisit> {
  const [record] = await visitRecords(db, eq(siteVisits.id, visitId));
  if (!record) throw notFound('That visit');
  return record;
}

/** The saved point of a customer's site, when it has one. */
export async function sitePointOf(
  db: DatabaseExecutor,
  propertyId: string | null,
): Promise<GeoPoint | null> {
  if (!propertyId) return null;
  const [row] = await db
    .select({ latitude: properties.latitude, longitude: properties.longitude })
    .from(properties)
    .where(eq(properties.id, propertyId));
  return row && row.latitude !== null && row.longitude !== null
    ? { latitude: row.latitude, longitude: row.longitude }
    : null;
}

interface Left {
  readonly automatic: boolean;
  readonly distanceM: number | null;
  readonly far: boolean | null;
  readonly located: boolean;
  readonly minutes: number;
}

/** The project history line for a check-out: the task's own wording, or a general one. */
async function noteLeft(
  tx: Transaction,
  actor: Actor,
  open: VisitRow,
  task: SiteTask | null,
  left: Left,
): Promise<void> {
  if (task) {
    await noteCheckOut(tx, task, {
      visitId: open.id,
      userId: actor.userId,
      fullName: actor.fullName,
      ...left,
    });
    return;
  }
  await noteVisitEnded(tx, {
    visitId: open.id,
    projectId: open.projectId,
    taskId: open.taskId,
    userId: actor.userId,
    message: `Checked out of the site${left.automatic ? ' automatically' : ''} after ${left.minutes} min, ${distanceWords(
      left.distanceM,
      left.far,
      left.located,
    )}.`,
  });
}

/**
 * Ends the person's own open visit in one transaction (live review S1, S6, S7): the
 * check-out, the phone's battery and connection, the planned visit marked done if it is
 * still confirmed, and the history note. By the task's open visit when a task is given,
 * else by the visit's id.
 */
export async function endOwnVisit(
  db: Database,
  actor: Actor,
  input: {
    readonly task: SiteTask | null;
    readonly visitId?: string;
    readonly site: GeoPoint | null;
    readonly position: Position | null | undefined;
    /** The phone's fence or the route ended it: the event's time, and nothing if already ended. */
    readonly auto?: AutoVisit | undefined;
  },
): Promise<void> {
  const { auto } = input;
  const { at: now, source } = await visitMoment(db, actor, auto, new Date(), 'out');
  const reading = await usableReading(db, actor.userId, input.position, now);
  const radius = reading?.policy.travel.farFromSiteM ?? 0;
  const measured = reading ? siteDistance(reading.position, input.site, radius) : null;
  const ended = await db.transaction((tx) =>
    closeOpen(tx, actor, input, { at: now, source, reading, measured }),
  );
  // The route or the phone already ended it: the same event twice is not an error.
  if (!ended && !(auto && auto.source !== 'manual'))
    throw conflict('You are not checked in at this site.', 'not_checked_in');
}

type Reading = Awaited<ReturnType<typeof usableReading>>;

/** The check-out itself, in the caller's transaction; false when nothing was open to close. */
async function closeOpen(
  tx: Transaction,
  actor: Actor,
  input: { readonly task: SiteTask | null; readonly visitId?: string | undefined },
  moment: {
    readonly at: Date;
    readonly source: CheckInSource;
    readonly reading: Reading;
    readonly measured: ReturnType<typeof siteDistance> | null;
  },
): Promise<boolean> {
  const { task } = input;
  const { at, source, reading, measured } = moment;
  const [open] = await tx
    .select()
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.userId, actor.userId),
        isNull(siteVisits.checkOutAt),
        task ? eq(siteVisits.taskId, task.id) : eq(siteVisits.id, input.visitId ?? ''),
      ),
    )
    .limit(1);
  if (!open) return false;
  const closedAt = visitCloseAt(open.checkInAt, at);
  const [done] = await tx
    .update(siteVisits)
    .set({
      checkOutAt: closedAt,
      checkOutSource: source,
      checkOutLatitude: reading?.position.latitude ?? null,
      checkOutLongitude: reading?.position.longitude ?? null,
      checkOutAccuracyM: reading ? accuracy(reading.position) : null,
      checkOutDistanceM: measured?.distanceM ?? null,
      checkOutFar: measured?.far ?? null,
      closeKind: 'self',
      updatedAt: at,
    })
    .where(and(eq(siteVisits.id, open.id), isNull(siteVisits.checkOutAt)))
    .returning({ id: siteVisits.id });
  if (!done) return false;
  await afterSiteCheckOut(tx, actor.userId, open.id, reading?.position ?? null);
  await finishLinkedVisit(tx, open.visitId, actor.userId, task?.title ?? 'Service visit');
  await noteLeft(tx, actor, open, task, {
    distanceM: measured?.distanceM ?? null,
    far: measured?.far ?? null,
    located: reading !== null,
    minutes: Math.max(0, Math.round((closedAt.getTime() - open.checkInAt.getTime()) / 60_000)),
    automatic: source !== 'manual',
  });
  return true;
}
