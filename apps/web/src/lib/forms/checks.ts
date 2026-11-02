import { todayIn } from '@oneohm/shared';

const MOBILE = /^(\+91)?[6-9]\d{9}$/;

/** True for a 10-digit Indian mobile, with or without +91 and spaces. */
export function isIndianMobile(value: string): boolean {
  return MOBILE.test(value.replace(/[\s-]/g, ''));
}

/** The time now (`HH:MM`) in the business timezone (India). */
export function nowTimeIn(timeZone = 'Asia/Kolkata', now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

/** A typed number, or null when the text is empty or not a finite number. */
export function parseNumber(value: string): number | null {
  const text = value.trim().replace(/,/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** True when a calendar date is today or later in India. */
export function isTodayOrLater(date: string): boolean {
  return date >= todayIn();
}

/** True when a calendar date is not after today in India. */
export function isNotFuture(date: string): boolean {
  return date <= todayIn();
}

/** A message key under `checks` in the messages. */
export type CheckKey =
  | 'required'
  | 'mobile'
  | 'dateNotPast'
  | 'dateNotFuture'
  | 'timeNotPast'
  | 'positiveAmount'
  | 'positiveNumber'
  | 'notNegative';

/** A follow-up must be today or later; today's time must not be gone already. */
export function followUpProblem(
  date: string,
  time: string | null,
  today: string = todayIn(),
  now: string = nowTimeIn(),
): { readonly field: 'date' | 'time'; readonly key: CheckKey } | null {
  if (!date) return { field: 'date', key: 'required' };
  if (date < today) return { field: 'date', key: 'dateNotPast' };
  if (date === today && time && time < now) return { field: 'time', key: 'timeNotPast' };
  return null;
}

/** Money typed in rupees must be a number above zero. */
export function amountProblem(text: string): CheckKey | null {
  const value = parseNumber(text);
  return value === null || value <= 0 ? 'positiveAmount' : null;
}

/** An optional number may be empty; when typed it must be zero or more. */
export function optionalNotNegativeProblem(text: string): CheckKey | null {
  if (!text.trim()) return null;
  const value = parseNumber(text);
  return value === null || value < 0 ? 'notNegative' : null;
}

/** A date something already happened on: required, and not after today. */
export function happenedOnProblem(date: string, today: string = todayIn()): CheckKey | null {
  if (!date) return 'required';
  return date > today ? 'dateNotFuture' : null;
}
