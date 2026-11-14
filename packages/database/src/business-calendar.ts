import { type BusinessCalendar, calendarFrom, withPolicyDefaults } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { holidays, workforcePolicy } from './schema/workforce.schema';

const CACHE_MS = 60_000;
const cache = new Map<string, { readonly at: number; readonly calendar: BusinessCalendar }>();

/** The business time zone: BUSINESS_TIMEZONE, else India. */
export const businessTimeZone = (): string => process.env.BUSINESS_TIMEZONE ?? 'Asia/Kolkata';

/** Forget the cached calendar in this process (a save calls this; other processes catch up within a minute). */
export function invalidateBusinessCalendar(): void {
  cache.clear();
}

/**
 * The one business calendar: working days and hours from the workforce policy
 * (`weeklyOff`, `attendance.dayStart` / `dayEnd`, lunch) and the holidays table. Cached in this
 * process for about a minute; saving Working time & holidays clears the saving process's copy.
 */
export async function readBusinessCalendar(
  db: DatabaseExecutor,
  timeZone: string = businessTimeZone(),
  now: number = Date.now(),
): Promise<BusinessCalendar> {
  const hit = cache.get(timeZone);
  if (hit && now - hit.at < CACHE_MS) return hit.calendar;
  const [row] = await db
    .select({ policy: workforcePolicy.policy })
    .from(workforcePolicy)
    .where(eq(workforcePolicy.id, 'default'))
    .limit(1);
  const days = await db.select({ day: holidays.day }).from(holidays);
  const policy = withPolicyDefaults(row?.policy);
  const calendar = calendarFrom({
    timeZone,
    weeklyOff: policy.weeklyOff,
    dayStart: policy.attendance.dayStart,
    dayEnd: policy.attendance.dayEnd,
    lunchStart: policy.attendance.lunchStart,
    lunchEnd: policy.attendance.lunchEnd,
    holidays: days.map((one) => one.day),
  });
  cache.set(timeZone, { at: now, calendar });
  return calendar;
}
