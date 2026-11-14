import {
  type BusinessCalendar,
  calendarOf,
  clockShort,
  clockString,
  daySlots,
  daysText,
  hoursText,
  parseClock,
  slotOpenFor,
  type VisitSettings,
  type WorkingTimeSettings,
} from '@oneohm/domain';
import { addDays } from '@oneohm/shared';

/** "1–2 pm": a span said short, the am/pm said once when both ends share it. */
export function lunchText(startMin: number, endMin: number): string {
  const start = clockShort(startMin);
  const end = clockShort(endMin);
  const meridiem = / (am|pm)$/;
  const same = start.match(meridiem)?.[1] === end.match(meridiem)?.[1];
  return `${same ? start.replace(meridiem, '') : start}–${end}`;
}

/** "Open Mon–Sat, 9:30 am–6:30 pm" and ", lunch 1–2 pm"; null while the values are not sound. */
export function openingParts(
  work: WorkingTimeSettings,
): { open: string; lunch: string | null } | null {
  const cal = calendarOf(work);
  if (work.weeklyOff.length >= 7 || cal.endMin <= cal.startMin) return null;
  const open = `${daysText(cal)}, ${hoursText(cal)}`;
  return { open, lunch: cal.lunch ? lunchText(cal.lunch.startMin, cal.lunch.endMin) : null };
}

/** One piece of the sample day: a visit time, or the lunch break between visits. */
export type DayPiece =
  | { readonly kind: 'slot'; readonly text: string }
  | { readonly kind: 'lunch' };

/** A working day as visits see it: "10:00–11:30", "11:30–13:00", lunch, "14:00–15:30" … */
export function dayPieces(
  cal: BusinessCalendar,
  visits: Pick<VisitSettings, 'slotStarts' | 'visitMinutes'>,
  day: string,
): DayPiece[] {
  const pieces: DayPiece[] = daySlots(cal, visits, day).map((slot) => ({
    kind: 'slot',
    text: `${clockString(slot.startMin)}–${clockString(slot.endMin)}`,
  }));
  if (!cal.lunch) return pieces;
  const slots = daySlots(cal, visits, day);
  const at = slots.findIndex((slot) => slot.startMin >= (cal.lunch?.startMin ?? 0));
  pieces.splice(at < 0 ? pieces.length : at, 0, { kind: 'lunch' });
  return pieces;
}

/** The first moment a customer can book: the soonest day and slot that is open for them. */
export function firstBookable(
  cal: BusinessCalendar,
  visits: VisitSettings,
  now: Date,
  today: string,
): { day: string; startMin: number } | null {
  for (let step = 0; step <= visits.daysAhead; step += 1) {
    const day = addDays(today, step);
    const open = daySlots(cal, visits, day).find((slot) =>
      slotOpenFor(cal, visits, day, slot, now, 'customer'),
    );
    if (open) return { day, startMin: open.startMin };
  }
  return null;
}

/** A visit time as minutes, or null when the text is not a time. */
export function minutesOf(text: string): number | null {
  const value = parseClock(text);
  return Number.isNaN(value) ? null : value;
}
