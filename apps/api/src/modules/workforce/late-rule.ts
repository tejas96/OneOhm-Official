import { type DatabaseExecutor, readBusinessCalendar } from '@oneohm/database';
import { clockAt, isLateOnDay, type WorkforcePolicy } from '@oneohm/domain';

/**
 * Whether a check-in at this moment is late: after the day start plus grace, and never on
 * a holiday or weekly off (live review A7). Live check-ins, site auto check-ins and
 * approved corrections all ask here, so a time is judged one way.
 */
export async function isLateAt(
  db: DatabaseExecutor,
  policy: WorkforcePolicy,
  checkInAt: Date,
  workDate?: string,
): Promise<boolean> {
  const calendar = await readBusinessCalendar(db);
  const day = workDate ?? clockAt(checkInAt, calendar.timeZone).day;
  return isLateOnDay(checkInAt, day, policy.attendance, calendar);
}
