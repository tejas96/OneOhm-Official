/**
 * The consumer number on an electricity bill (PRD 3.2). Each connection has its own, so
 * no two sites may share one. People type it with spaces or dashes; it is kept without
 * them, in capitals, so the same number always compares the same.
 */

/** What the database index compares: letters and digits only, in capitals. */
export const CONSUMER_NUMBER_KEY_SQL =
  "upper(regexp_replace(consumer_number, '[^A-Za-z0-9]', '', 'g'))";

const SEPARATORS = /[\s\-./]/g;
const SHAPE = /^[A-Z0-9]{6,20}$/;

/** The number as typed, without spaces, dashes, dots or slashes, in capitals. */
export function normalizeConsumerNumber(raw: string): string {
  return raw.replace(SEPARATORS, '').toUpperCase();
}

/** Why a normalized number cannot be right, or null when it can. */
export function consumerNumberProblem(normalized: string): string | null {
  if (!SHAPE.test(normalized)) {
    return 'Use the consumer number from the bill: 6 to 20 letters or digits.';
  }
  if (!/\d/.test(normalized)) return 'A consumer number has digits. Check the bill.';
  return null;
}
