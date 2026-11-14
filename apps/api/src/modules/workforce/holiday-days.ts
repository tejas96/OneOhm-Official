import type { HolidayDay, StaffCalendar } from '@oneohm/api-contracts';
import { type DatabaseExecutor, holidays } from '@oneohm/database';
import type { WorkforcePolicy } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, asc, gte, lte } from 'drizzle-orm';

/** The business's holidays from `from` to `to` (inclusive), soonest first. */
export async function holidaysBetween(
  db: DatabaseExecutor,
  from: string,
  to: string,
): Promise<HolidayDay[]> {
  if (to < from) return [];
  return db
    .select({ day: holidays.day, name: holidays.name })
    .from(holidays)
    .where(and(gte(holidays.day, from), lte(holidays.day, to)))
    .orderBy(asc(holidays.day));
}

/** Working days, hours and the next year's holidays, as staff see them on their Leave screen. */
export async function staffCalendar(
  db: DatabaseExecutor,
  policy: WorkforcePolicy,
  today: string,
): Promise<StaffCalendar> {
  const { attendance } = policy;
  return {
    weeklyOff: [...policy.weeklyOff].sort((a, b) => a - b),
    dayStart: attendance.dayStart,
    dayEnd: attendance.dayEnd,
    lunchStart: attendance.lunchStart ?? null,
    lunchEnd: attendance.lunchEnd ?? null,
    upcomingHolidays: await holidaysBetween(db, today, addDays(today, 365)),
  };
}

/** Holiday dates from `from` on, for counting leave (a holiday is never a leave day). */
export async function holidayDatesFrom(db: DatabaseExecutor, from: string): Promise<string[]> {
  return (await holidaysBetween(db, from, '9999-12-31')).map((holiday) => holiday.day);
}
