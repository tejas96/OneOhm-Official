import { addDays, todayIn } from '@oneohm/shared';
import {
  type BusinessCalendar,
  clockAt,
  isWorkingDay,
  parseClock,
  zonedInstant,
} from './business-calendar';
import { partOfDay, rangeText, type WordsLang } from './hours-text';
import type { VisitSettings } from './visit-settings';

/** A span of one day, in minutes after midnight. */
export interface Span {
  readonly startMin: number;
  readonly endMin: number;
}

export interface DaySlot extends Span {
  /** "10:00–11:30 am" */
  readonly label: string;
}

/** Who is booking: a customer (notice applies) or staff (may book today). */
export type Booker = 'customer' | 'staff';

/** Whether two spans share any time (touching ends do not overlap). */
export const overlaps = (a: Span, b: Span): boolean =>
  a.startMin < b.endMin && b.startMin < a.endMin;

/** The half of the day a start time falls in; the older morning/afternoon column keeps this. */
export const slotHalf = (startMin: number): 'morning' | 'afternoon' =>
  startMin < 12 * 60 ? 'morning' : 'afternoon';

/**
 * A slot said for a customer: "10:00–11:30 am", "11:30 am–1:00 pm"; in Marathi and Hindi the
 * part of the day leads ("सकाळी 10:00–11:30").
 */
export function slotLabel(startMin: number, endMin: number, lang: WordsLang = 'en'): string {
  if (lang === 'en') return rangeText(startMin, endMin, 'en');
  const first = partOfDay(startMin, lang);
  const last = partOfDay(endMin - 1, lang);
  const range = rangeText(startMin, endMin, lang);
  return first === last ? `${first} ${range}` : `${first} ${range} ${last}`;
}

/**
 * The visit times of a working day: every start time with its end (start + visit length),
 * leaving out non-working days, holidays, and times that overlap lunch or the working hours.
 */
export function daySlots(
  cal: BusinessCalendar,
  visits: Pick<VisitSettings, 'slotStarts' | 'visitMinutes'>,
  day: string,
  lang: WordsLang = 'en',
): DaySlot[] {
  if (!isWorkingDay(day, cal)) return [];
  const slots: DaySlot[] = [];
  for (const text of visits.slotStarts) {
    const startMin = parseClock(text);
    const endMin = startMin + visits.visitMinutes;
    if (Number.isNaN(startMin) || startMin < cal.startMin || endMin > cal.endMin) continue;
    if (cal.lunch && overlaps({ startMin, endMin }, cal.lunch)) continue;
    slots.push({ startMin, endMin, label: slotLabel(startMin, endMin, lang) });
  }
  return slots.sort((a, b) => a.startMin - b.startMin);
}

/**
 * Whether `who` may book this slot at `now`: inside the booking window, and a customer needs
 * the notice hours; staff may book later today when the setting allows it.
 */
export function slotOpenFor(
  cal: BusinessCalendar,
  visits: Pick<VisitSettings, 'customerNoticeHours' | 'staffMayBookToday' | 'daysAhead'>,
  day: string,
  slot: Span,
  now: Date,
  who: Booker,
): boolean {
  const today = todayIn(cal.timeZone, now);
  if (day < today || day > addDays(today, visits.daysAhead)) return false;
  const starts = zonedInstant(day, slot.startMin, cal.timeZone).getTime();
  if (who === 'customer') return starts - now.getTime() >= visits.customerNoticeHours * 3_600_000;
  return day > today || (visits.staffMayBookToday && starts > now.getTime());
}

/**
 * The days `who` can book, soonest first, from today up to `daysAhead`: working days with at
 * least one slot that is not too soon. A customer's today counts only when a slot starts the
 * notice hours ahead, else the first day is the next working day. (Show the first `daysShown`.)
 */
export function bookableDays(
  cal: BusinessCalendar,
  visits: VisitSettings,
  now: Date,
  who: Booker,
): string[] {
  const today = clockAt(now, cal.timeZone).day;
  const days: string[] = [];
  for (let step = 0; step <= visits.daysAhead; step += 1) {
    const day = addDays(today, step);
    const open = daySlots(cal, visits, day).some((slot) =>
      slotOpenFor(cal, visits, day, slot, now, who),
    );
    if (open) days.push(day);
  }
  return days;
}

/**
 * The free times of a day for one person: the day's slots that `who` may book now and that
 * hold fewer than `visitsPerSlot` of the person's `busy` spans (their open visits, or the whole
 * day for leave).
 */
export function freeTimes(
  cal: BusinessCalendar,
  visits: VisitSettings,
  day: string,
  busy: readonly Span[],
  now: Date,
  who: Booker,
  lang: WordsLang = 'en',
): DaySlot[] {
  return daySlots(cal, visits, day, lang).filter(
    (slot) =>
      slotOpenFor(cal, visits, day, slot, now, who) &&
      busy.filter((span) => overlaps(span, slot)).length < visits.visitsPerSlot,
  );
}
