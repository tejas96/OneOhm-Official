import { visitCloseAt, zonedInstant } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, eq, isNull, lt, lte } from 'drizzle-orm';
import type { Database, DatabaseExecutor } from './client';
import { siteVisits } from './schema/site-activity.schema';
import { takeTravelSnapshot } from './travel-snapshot';

/**
 * Ends the person's open site visits when their day ends (live review S1): the person's
 * End duty, or the night job ending a forgotten day. The visit is closed at `at` (never
 * before it began) and marked as closed by the end of the day. Without `until`, every
 * open visit of the person closes; with it, only those that began by then. Returns the
 * ids closed. Running again finds nothing open.
 */
export async function closeVisitsAtDayEnd(
  db: DatabaseExecutor,
  userId: string,
  at: Date,
  until?: Date,
): Promise<string[]> {
  const open = await db
    .select({ id: siteVisits.id, checkInAt: siteVisits.checkInAt })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.userId, userId),
        isNull(siteVisits.checkOutAt),
        until ? lte(siteVisits.checkInAt, until) : undefined,
      ),
    );
  const closed: string[] = [];
  const now = new Date();
  for (const visit of open) {
    const [done] = await db
      .update(siteVisits)
      .set({
        checkOutAt: visitCloseAt(visit.checkInAt, at),
        closeKind: 'day_end',
        checkOutSource: 'day_end',
        closeNote: 'Ended with the day.',
        updatedAt: now,
      })
      .where(and(eq(siteVisits.id, visit.id), isNull(siteVisits.checkOutAt)))
      .returning({ id: siteVisits.id });
    if (done) closed.push(done.id);
  }
  return closed;
}

/**
 * Closes every site visit left open from an earlier day, at the end of the day it began
 * (live review S1), even when the person's attendance for that day is already closed. The
 * day's saved travel is made again so the visit is counted. One transaction per visit;
 * running again finds nothing open. Returns how many visits were closed.
 */
export async function closeStaleVisits(
  db: Database,
  today: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<number> {
  const stale = await db
    .select({
      id: siteVisits.id,
      userId: siteVisits.userId,
      workDate: siteVisits.workDate,
      checkInAt: siteVisits.checkInAt,
    })
    .from(siteVisits)
    .where(and(isNull(siteVisits.checkOutAt), lt(siteVisits.workDate, today)));
  let closed = 0;
  for (const visit of stale) {
    const dayEnd = zonedInstant(addDays(visit.workDate, 1), 0, timeZone);
    const done = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(siteVisits)
        .set({
          checkOutAt: visitCloseAt(visit.checkInAt, dayEnd),
          closeKind: 'day_end',
          checkOutSource: 'day_end',
          closeNote: 'Ended with the day.',
          updatedAt: now,
        })
        .where(and(eq(siteVisits.id, visit.id), isNull(siteVisits.checkOutAt)))
        .returning({ id: siteVisits.id });
      if (!row) return false;
      await takeTravelSnapshot(tx, visit.userId, visit.workDate, now);
      return true;
    });
    if (done) closed += 1;
  }
  return closed;
}
