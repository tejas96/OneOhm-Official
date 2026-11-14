import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../common/primitives';

const clock = z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time, like 09:30.');
const whole = z.number().int();

/** A company holiday: no visits are offered or booked on it. */
export const holidaySchema = z.object({
  day: calendarDateSchema,
  name: z.string().trim().min(1, 'Name the holiday.').max(80),
});
export type Holiday = z.infer<typeof holidaySchema>;

/**
 * Working days, hours, lunch and holidays: the one business calendar (Settings → Working time &
 * holidays). Days and hours are stored in the workforce policy; the API checks the values.
 */
export const workingTimeSchema = z.object({
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOff: z.array(whole.min(0).max(6)).max(7),
  dayStart: clock,
  dayEnd: clock,
  /** Both null = no lunch break. */
  lunchStart: clock.nullable(),
  lunchEnd: clock.nullable(),
  holidays: z.array(holidaySchema).max(400),
});
export type WorkingTimeRecord = z.infer<typeof workingTimeSchema>;

/** An upcoming open visit that the saved calendar leaves outside working time. */
export const outsideVisitSchema = z.object({
  id: idSchema,
  day: calendarDateSchema,
  startMin: whole.nullable(),
  endMin: whole.nullable(),
  /** Who it is for and what, e.g. "Survey — Asha Patil". */
  title: z.string(),
});

export const workingTimeSavedSchema = z.object({
  settings: workingTimeSchema,
  /** Booked visits now outside working time: not moved, not cancelled, listed for the team. */
  outside: z.object({ count: whole, visits: z.array(outsideVisitSchema) }),
});
export type WorkingTimeSaved = z.infer<typeof workingTimeSavedSchema>;

/** Settings → Visits & bookings. The API checks the ranges and the fit with working time. */
export const visitSettingsSchema = z.object({
  visitMinutes: whole,
  slotStarts: z.array(z.string()).max(40),
  visitsPerSlot: whole,
  customerNoticeHours: whole,
  staffMayBookToday: z.boolean(),
  daysAhead: whole,
  daysShown: whole,
  autoConfirmCustomerPicks: z.boolean(),
  reminders: z.object({
    dayBeforeAt: clock,
    hoursBefore: whole,
    notConfirmedAlertAt: clock,
  }),
  missedAfterMinutes: whole,
  leadSurveyVisitor: z.enum(['owner', 'owner_then_team']),
});
export type VisitSettingsRecord = z.infer<typeof visitSettingsSchema>;
