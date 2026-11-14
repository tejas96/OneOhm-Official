import { z } from 'zod';
import { calendarDateSchema } from '../common/primitives';

/** One business holiday (Settings → Working time & holidays). */
export const holidayDaySchema = z.object({ day: calendarDateSchema, name: z.string() });
export type HolidayDay = z.infer<typeof holidayDaySchema>;

/**
 * The business calendar as staff see it: which days and hours are working time, and the
 * holidays coming up, so nobody has to ask the office.
 */
export const staffCalendarSchema = z.object({
  /** Days of the week that are off: 0 is Sunday … 6 is Saturday. */
  weeklyOff: z.array(z.number().int().min(0).max(6)),
  dayStart: z.string(),
  dayEnd: z.string(),
  lunchStart: z.string().nullable(),
  lunchEnd: z.string().nullable(),
  /** From today on, soonest first (at most the next 12 months). */
  upcomingHolidays: z.array(holidayDaySchema),
});
export type StaffCalendar = z.infer<typeof staffCalendarSchema>;
