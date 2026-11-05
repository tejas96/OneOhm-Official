/** How close to the limit before a "n of max" counter appears. */
export const COUNTER_FROM = 0.8;

export interface TextCheck {
  /** Too short or too long: the plain reason is picked by the screen. */
  readonly problem: 'short' | 'long' | null;
  readonly length: number;
  /** Close to (or past) the limit: show "length of max". */
  readonly showCounter: boolean;
}

/** Counts a note the way the server does (trimmed) against its smallest and largest size. */
export function checkText(text: string, min: number, max: number): TextCheck {
  const length = text.trim().length;
  const problem = length > max ? 'long' : length > 0 && length < min ? 'short' : null;
  return { problem, length, showCounter: text.length >= max * COUNTER_FROM };
}

/**
 * A UTR is 12 to 22 letters and digits with no spaces or dashes (UPI and IMPS: 12 digits;
 * NEFT and RTGS: 16 to 22 characters). Used only for a gentle hint, never to block.
 */
export function utrLooksOff(reference: string): boolean {
  const value = reference.trim();
  return value !== '' && !/^[A-Za-z0-9]{12,22}$/.test(value);
}
