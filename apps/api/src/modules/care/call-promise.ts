import { callDay, isWorkingTime } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { localized, type Words } from '../whatsapp/assistant/language';

/** When a call promised now is due, and how the customer is told. */
export interface CallPromise {
  /** The moment the call is late: escalated when it has not happened by then. */
  readonly by: Date;
  /** `today` in working hours (with the clock), else the next working morning. */
  readonly kind: 'by' | 'today' | 'tomorrow' | 'monday';
  /** "4:30 pm" for `by`; empty otherwise. */
  readonly clock: string;
}

const HOUR = 3_600_000;
const WORK_END = '18:30';
/** A promise made in working hours is two hours away; one made out of hours is the opening time. */
const PROMISE_HOURS = 2;

const at = (day: string, time: string) => new Date(`${day}T${time}:00+05:30`);

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
 * The time-aware promise of a call (redesign §12, §13): in working hours (Monday to Saturday, 9:30 to
 * 6:30) two hours from now but never after closing; out of hours "tomorrow from 9:30" (Monday after
 * Saturday evening). `by` is when the call is late.
 */
export function callPromise(now: Date, timeZone: string): CallPromise {
  const today = todayIn(timeZone, now);
  if (isWorkingTime(now, timeZone)) {
    const by = new Date(
      Math.min(now.getTime() + PROMISE_HOURS * HOUR, at(today, WORK_END).getTime()),
    );
    return { by, kind: 'by', clock: clockWords(by, timeZone) };
  }
  const { day, add } = callDay(now, timeZone);
  const opens = at(addDays(today, add), '09:30');
  return { by: new Date(opens.getTime() + PROMISE_HOURS * HOUR), kind: day, clock: '' };
}

const EN = {
  by: (clock: string) => `by ${clock} today`,
  today: 'today from 9:30',
  tomorrow: 'tomorrow from 9:30',
  monday: 'on Monday from 9:30',
};
const MR: Words<typeof EN> = {
  by: (clock) => `आज ${clock} पर्यंत`,
  today: 'आज सकाळी ९:३० पासून',
  tomorrow: 'उद्या सकाळी ९:३० पासून',
  monday: 'सोमवारी सकाळी ९:३० पासून',
};
const HI: Words<typeof EN> = {
  by: (clock) => `आज ${clock} तक`,
  today: 'आज सुबह 9:30 से',
  tomorrow: 'कल सुबह 9:30 से',
  monday: 'सोमवार सुबह 9:30 से',
};
export const CALL_WHEN_LISTS = { en: EN, mr: MR, hi: HI };
const WHEN = localized(EN, { mr: MR, hi: HI });

/** "by 4:30 pm today" / "tomorrow from 9:30", in the language being spoken. */
export const callWhen = (promise: CallPromise): string =>
  promise.kind === 'by' ? WHEN.by(promise.clock) : WHEN[promise.kind];
