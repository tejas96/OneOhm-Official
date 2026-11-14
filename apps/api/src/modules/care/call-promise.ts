import { type BusinessCalendar, callDay, isWorkingTime, zonedInstant } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { promiseWhen } from '../whatsapp/assistant/hours-words';
import { localized, type Words } from '../whatsapp/assistant/language';

/** When a call promised now is due, and how the customer is told. */
export interface CallPromise {
  /** The moment the call is late: escalated when it has not happened by then. */
  readonly by: Date;
  /** `by` in working hours (with the clock), else the next working morning. */
  readonly kind: 'by' | 'today' | 'tomorrow' | 'later';
  /** "4:30 pm" for `by`; empty otherwise. */
  readonly clock: string;
}

const HOUR = 3_600_000;
/** A promise made in working hours is two hours away; one made out of hours is the opening time. */
const PROMISE_HOURS = 2;

function clockWords(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
    .format(date)
    .replace(/\s?([ap])m/i, (_, half: string) => ` ${half.toLowerCase()}m`);
}

/**
 * The time-aware promise of a call (redesign §12, §13): in working hours (the business calendar)
 * two hours from now but never after closing; out of hours the next working morning from opening.
 * `by` is when the call is late.
 */
export function callPromise(now: Date, cal: BusinessCalendar): CallPromise {
  const today = todayIn(cal.timeZone, now);
  if (isWorkingTime(now, cal)) {
    const closes = zonedInstant(today, cal.endMin, cal.timeZone);
    const by = new Date(Math.min(now.getTime() + PROMISE_HOURS * HOUR, closes.getTime()));
    return { by, kind: 'by', clock: clockWords(by, cal.timeZone) };
  }
  const { day, add } = callDay(now, cal);
  const opens = zonedInstant(addDays(today, add), cal.startMin, cal.timeZone);
  return { by: new Date(opens.getTime() + PROMISE_HOURS * HOUR), kind: day, clock: '' };
}

// The "from 9:30" times follow the opening time in Settings (hours-words.ts).
const EN = {
  by: (clock: string) => `by ${clock} today`,
  get today() {
    return promiseWhen('today', 'en');
  },
  get tomorrow() {
    return promiseWhen('tomorrow', 'en');
  },
  get later() {
    return promiseWhen('later', 'en');
  },
};
const MR: Words<typeof EN> = {
  by: (clock) => `आज ${clock} पर्यंत`,
  get today() {
    return promiseWhen('today', 'mr');
  },
  get tomorrow() {
    return promiseWhen('tomorrow', 'mr');
  },
  get later() {
    return promiseWhen('later', 'mr');
  },
};
const HI: Words<typeof EN> = {
  by: (clock) => `आज ${clock} तक`,
  get today() {
    return promiseWhen('today', 'hi');
  },
  get tomorrow() {
    return promiseWhen('tomorrow', 'hi');
  },
  get later() {
    return promiseWhen('later', 'hi');
  },
};
export const CALL_WHEN_LISTS = { en: EN, mr: MR, hi: HI };
const WHEN = localized(EN, { mr: MR, hi: HI });

/** "by 4:30 pm today" / "tomorrow from 9:30", in the language being spoken. */
export const callWhen = (promise: CallPromise): string =>
  promise.kind === 'by' ? WHEN.by(promise.clock) : WHEN[promise.kind];
