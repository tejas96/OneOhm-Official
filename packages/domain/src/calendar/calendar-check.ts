import { checkWhole, isClockTime, type SettingErrors } from '../settings/settings-check';
import { type BusinessCalendar, calendarFrom, parseClock } from './business-calendar';
import { rangeText } from './hours-text';
import { overlaps, type Span } from './slots';
import type { VisitSettings } from './visit-settings';

/**
 * The working days and hours as the Working time form edits them (stored in the workforce
 * policy: `weeklyOff`, `attendance.dayStart`, `dayEnd`, `lunchStart`, `lunchEnd`).
 */
export interface WorkingTimeSettings {
  /** 0 = Sunday … 6 = Saturday. */
  readonly weeklyOff: readonly number[];
  readonly dayStart: string;
  readonly dayEnd: string;
  /** Both null = no lunch break. */
  readonly lunchStart: string | null;
  readonly lunchEnd: string | null;
}

/** The calendar these settings make (no holidays), for the preview and the checks. */
export const calendarOf = (
  work: WorkingTimeSettings,
  timeZone = 'Asia/Kolkata',
  holidays: Iterable<string> = [],
): BusinessCalendar => calendarFrom({ timeZone, holidays, ...work });

const clock = (minutes: number) => {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hh}:${String(minutes % 60).padStart(2, '0')}`;
};

interface Parsed {
  startMin: number;
  endMin: number;
  lunch: Span | null;
}

/** Checks lunch against the (sound) hours; returns the lunch span, or null for none/invalid. */
function checkLunch(work: WorkingTimeSettings, errors: SettingErrors, hours: Span): Span | null {
  if (work.lunchStart === null && work.lunchEnd === null) return null;
  for (const field of ['lunchStart', 'lunchEnd'] as const)
    if (!isClockTime(work[field] ?? '')) errors[field] = 'Pick a time, like 13:00.';
  if (errors.lunchStart || errors.lunchEnd) return null;
  const from = parseClock(work.lunchStart ?? '');
  const to = parseClock(work.lunchEnd ?? '');
  if (to <= from) errors.lunchEnd = 'Lunch must end after it starts.';
  else if (from < hours.startMin || to > hours.endMin)
    errors.lunchStart = `Lunch must fall inside working hours (${work.dayStart}–${work.dayEnd}).`;
  else return { startMin: from, endMin: to };
  return null;
}

/** Checks the working days, hours and lunch on their own; returns the parsed hours when sound. */
function checkOwn(work: WorkingTimeSettings, errors: SettingErrors): Parsed | null {
  if (work.weeklyOff.length >= 7) errors.weeklyOff = 'Keep at least one working day.';
  for (const field of ['dayStart', 'dayEnd'] as const)
    if (!isClockTime(work[field])) errors[field] = 'Pick a time, like 09:30.';
  const startMin = parseClock(work.dayStart);
  const endMin = parseClock(work.dayEnd);
  if (errors.dayStart || errors.dayEnd) return null;
  if (endMin <= startMin) {
    errors.dayEnd = `Closing must be after opening (${work.dayStart}).`;
    return null;
  }
  const lunch = checkLunch(work, errors, { startMin, endMin });
  return errors.lunchStart || errors.lunchEnd ? null : { startMin, endMin, lunch };
}

interface Problem {
  /** Which working-time field is to blame. */
  readonly field: 'dayStart' | 'dayEnd' | 'lunchStart';
  readonly message: string;
}

/** What the current hours do to the visit times and reminder times, named so it can be fixed. */
function fitProblems(hours: Parsed, visits: VisitSettings): Problem[] {
  const problems: Problem[] = [];
  const open = `${clock(hours.startMin)}–${clock(hours.endMin)}`;
  const slots = visits.slotStarts.map((text) => parseClock(text)).filter((n) => !Number.isNaN(n));
  for (const start of slots) {
    const end = start + visits.visitMinutes;
    const name = `${clock(start)} visit time`;
    if (start < hours.startMin)
      problems.push({
        field: 'dayStart',
        message: `The ${name} starts before opening (${clock(hours.startMin)}). Change that time in Visits & bookings first.`,
      });
    else if (end > hours.endMin)
      problems.push({
        field: 'dayEnd',
        message: `The ${name} would end at ${clock(end)}, after closing (${clock(hours.endMin)}). Change that time in Visits & bookings first.`,
      });
    else if (hours.lunch && overlaps({ startMin: start, endMin: end }, hours.lunch))
      problems.push({
        field: 'lunchStart',
        message: `The ${name} (${clock(start)}–${clock(end)}) runs into lunch (${clock(hours.lunch.startMin)}–${clock(hours.lunch.endMin)}). Change that time in Visits & bookings first.`,
      });
  }
  const reminders: [string, string][] = [
    ['The day-before reminder', visits.reminders.dayBeforeAt],
    ['The not-confirmed alert', visits.reminders.notConfirmedAlertAt],
  ];
  for (const [name, text] of reminders) {
    const at = parseClock(text);
    if (Number.isNaN(at)) continue;
    if (at < hours.startMin || at >= hours.endMin)
      problems.push({
        field: at < hours.startMin ? 'dayStart' : 'dayEnd',
        message: `${name} at ${text} is outside working hours (${open}). Change it in Visits & bookings first.`,
      });
  }
  return problems;
}

/**
 * Checks the Working time form: days, hours and lunch on their own, then against the visit
 * times and reminders already saved (so closing at 17:00 is refused while a 17:00 visit time
 * exists). The same function runs in the API on save and in the web page as you type.
 */
export function checkWorkingTime(work: WorkingTimeSettings, visits: VisitSettings): SettingErrors {
  const errors: SettingErrors = {};
  const hours = checkOwn(work, errors);
  if (!hours) return errors;
  for (const problem of fitProblems(hours, visits)) errors[problem.field] ??= problem.message;
  return errors;
}

const LEAD_VISITORS = ['owner', 'owner_then_team'];

/** A reminder time must be a clock time inside working hours. */
function checkInsideHours(
  errors: SettingErrors,
  field: string,
  text: string,
  hours: Parsed | null,
  work: WorkingTimeSettings,
) {
  if (!isClockTime(text)) {
    errors[field] = 'Pick a time, like 17:00.';
    return;
  }
  const at = parseClock(text);
  if (hours && (at < hours.startMin || at >= hours.endMin))
    errors[field] = `Pick a time inside working hours (${work.dayStart}–${work.dayEnd}).`;
}

/**
 * Checks the Visits & bookings form on its own and against the working hours, days and lunch
 * saved in Working time. Field paths (`slotStarts.2`, `reminders.dayBeforeAt`) mark the inputs.
 */
export function checkVisitSettings(
  visits: VisitSettings,
  work: WorkingTimeSettings,
): SettingErrors {
  const errors: SettingErrors = {};
  const hours = checkOwn(work, {});
  checkWhole(errors, 'visitMinutes', visits.visitMinutes, 30, 240, 'minutes');
  checkWhole(errors, 'visitsPerSlot', visits.visitsPerSlot, 1, 3, 'visits');
  checkWhole(errors, 'daysAhead', visits.daysAhead, 1, 45);
  checkWhole(errors, 'daysShown', visits.daysShown, 1, 9);
  checkWhole(errors, 'customerNoticeHours', visits.customerNoticeHours, 0, 72, 'hours');
  checkWhole(errors, 'missedAfterMinutes', visits.missedAfterMinutes, 0, 480, 'minutes');
  checkWhole(errors, 'reminders.hoursBefore', visits.reminders.hoursBefore, 0, 24, 'hours');
  if (!errors.daysShown && !errors.daysAhead && visits.daysShown > visits.daysAhead)
    errors.daysShown = `Cannot show more days (${visits.daysShown}) than customers can book ahead (${visits.daysAhead}).`;
  if (
    !errors.customerNoticeHours &&
    !errors.daysAhead &&
    visits.customerNoticeHours >= visits.daysAhead * 24
  )
    errors.customerNoticeHours =
      'The notice must be shorter than the days customers can book ahead.';
  if (!LEAD_VISITORS.includes(visits.leadSurveyVisitor))
    errors.leadSurveyVisitor = 'Pick who does a lead survey.';
  checkInsideHours(errors, 'reminders.dayBeforeAt', visits.reminders.dayBeforeAt, hours, work);
  checkInsideHours(
    errors,
    'reminders.notConfirmedAlertAt',
    visits.reminders.notConfirmedAlertAt,
    hours,
    work,
  );
  checkSlots(errors, visits, hours);
  return errors;
}

function checkSlots(errors: SettingErrors, visits: VisitSettings, hours: Parsed | null) {
  if (visits.slotStarts.length === 0) {
    errors.slotStarts = 'Keep at least one visit time.';
    return;
  }
  if (visits.slotStarts.length > 12) errors.slotStarts = 'At most 12 visit times.';
  let before: number | null = null;
  visits.slotStarts.forEach((text, index) => {
    const field = `slotStarts.${index}`;
    const start = parseClock(text);
    if (Number.isNaN(start)) {
      errors[field] = 'Pick a time, like 10:00.';
      return;
    }
    const end = start + visits.visitMinutes;
    const span = rangeText(start, end);
    if (before !== null && start < before + visits.visitMinutes) {
      errors[field] =
        start <= before
          ? 'List the times earliest first, each once.'
          : `${text} starts before the ${clock(before)} visit ends (${visits.visitMinutes} minutes each).`;
    } else if (hours && start < hours.startMin) {
      errors[field] = `${text} is before opening (${clock(hours.startMin)}).`;
    } else if (hours && end > hours.endMin) {
      errors[field] =
        `${text} would end at ${clock(end)} (${span}), after closing (${clock(hours.endMin)}).`;
    } else if (hours?.lunch && overlaps({ startMin: start, endMin: end }, hours.lunch)) {
      errors[field] =
        `${text}–${clock(end)} runs into lunch (${clock(hours.lunch.startMin)}–${clock(hours.lunch.endMin)}).`;
    }
    before = start;
  });
}
