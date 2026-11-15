import {
  attendanceDays,
  businessTimeZone,
  type DatabaseExecutor,
  dutyPoints,
} from '@oneohm/database';
import { dutyWindowEnd } from '@oneohm/domain';
import { eq, inArray } from 'drizzle-orm';

/**
 * After an approved correction moved a day's check-in or check-out: deletes the route points
 * of that day that now fall outside it (before the new check-in, or after the new check-out
 * plus the 5-minute late flush), by the same window rule that took them in.
 */
export async function pruneDutyPoints(db: DatabaseExecutor, dayId: string): Promise<number> {
  const [day] = await db
    .select({
      id: attendanceDays.id,
      workDate: attendanceDays.workDate,
      checkInAt: attendanceDays.checkInAt,
      checkOutAt: attendanceDays.checkOutAt,
    })
    .from(attendanceDays)
    .where(eq(attendanceDays.id, dayId))
    .limit(1);
  if (!day) return 0;
  const end = dutyWindowEnd(day, new Date(), businessTimeZone());
  const points = await db
    .select({ id: dutyPoints.id, recordedAt: dutyPoints.recordedAt })
    .from(dutyPoints)
    .where(eq(dutyPoints.attendanceDayId, dayId));
  const stray = points.filter(
    (point) => point.recordedAt < day.checkInAt || point.recordedAt.getTime() > end,
  );
  if (stray.length === 0) return 0;
  await db.delete(dutyPoints).where(
    inArray(
      dutyPoints.id,
      stray.map((point) => point.id),
    ),
  );
  return stray.length;
}
