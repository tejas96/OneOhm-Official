import { calendarFrom } from './business-calendar';
import { daysText, hoursText, rangeText } from './hours-text';

/** The working week as Settings → Working time & holidays saves it. */
export interface WorkingWeek {
  readonly weeklyOff: readonly number[];
  readonly dayStart: string;
  readonly dayEnd: string;
  readonly lunchStart: string | null;
  readonly lunchEnd: string | null;
}

/**
 * The working week for staff, one short line each: days ("Mon–Sat"), hours
 * ("9:30 am–6:30 pm") and lunch ("1:00–2:00 pm", or null when there is none).
 */
export function staffHours(week: WorkingWeek): {
  readonly days: string;
  readonly hours: string;
  readonly lunch: string | null;
} {
  const cal = calendarFrom({ timeZone: 'Asia/Kolkata', ...week });
  return {
    days: daysText(cal) || 'No working days set',
    hours: hoursText(cal),
    lunch: cal.lunch ? rangeText(cal.lunch.startMin, cal.lunch.endMin) : null,
  };
}
