import { attendanceDays, type DatabaseExecutor, siteVisits } from '@oneohm/database';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

/**
 * The earliest moment an automatic event of the person may be given today: their latest site
 * check-out and the day's check-in, whichever is later; null with neither. An event that says
 * it happened before that cannot be right (a fence that fired again after a hand check-out),
 * so it is recorded at the server's time instead of being backdated.
 */
export async function autoFloor(
  db: DatabaseExecutor,
  userId: string,
  workDate: string,
): Promise<Date | null> {
  const [out] = await db
    .select({ at: siteVisits.checkOutAt })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.userId, userId),
        eq(siteVisits.workDate, workDate),
        isNotNull(siteVisits.checkOutAt),
      ),
    )
    .orderBy(desc(siteVisits.checkOutAt))
    .limit(1);
  const [day] = await db
    .select({ at: attendanceDays.checkInAt })
    .from(attendanceDays)
    .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, workDate)))
    .limit(1);
  const times = [out?.at, day?.at].filter((at): at is Date => at instanceof Date);
  return times.length > 0 ? new Date(Math.max(...times.map((at) => at.getTime()))) : null;
}
