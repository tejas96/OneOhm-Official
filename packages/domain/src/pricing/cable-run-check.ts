/**
 * The numbers of one cable run as someone types them in a quotation's site detail
 * (PRD 3.9 A), with the limits the API accepts: floor 0 to 40, metres 0 to 2,000, and
 * 1 to 100 cables on a route. A run that cannot be read is said out loud, never dropped.
 */
export const RUN_NUMBER_LIMITS = {
  floor: { min: 0, max: 40, whole: true, unit: '' },
  acrossM: { min: 0, max: 2_000, whole: false, unit: 'm' },
  upM: { min: 0, max: 2_000, whole: false, unit: 'm' },
  runs: { min: 1, max: 100, whole: true, unit: '' },
} as const;

export type RunNumberField = keyof typeof RUN_NUMBER_LIMITS;
export type RunNumberProblem = 'not_a_number' | 'too_small' | 'too_big' | 'not_whole';

export type RunNumberReading =
  | { readonly value: number; readonly problem: null }
  | { readonly value: null; readonly problem: RunNumberProblem };

const NUMBER = /^-?\d+(?:\.\d+)?$|^-?\.\d+$/;

/**
 * Reads one typed number: "12", "12.5", "1,200", or "12 m" where it is metres. Blank
 * means the least the field allows (0, or 1 cable).
 */
export function readRunNumber(field: RunNumberField, text: string): RunNumberReading {
  const limits = RUN_NUMBER_LIMITS[field];
  let cleaned = text.replace(/[,\s]/g, '').toLowerCase();
  if (limits.unit && cleaned.endsWith(limits.unit)) cleaned = cleaned.slice(0, -limits.unit.length);
  if (cleaned === '') return { value: limits.min, problem: null };
  if (!NUMBER.test(cleaned)) return { value: null, problem: 'not_a_number' };
  const value = Number(cleaned);
  if (value < limits.min) return { value: null, problem: 'too_small' };
  if (value > limits.max) return { value: null, problem: 'too_big' };
  if (limits.whole && !Number.isInteger(value)) return { value: null, problem: 'not_whole' };
  return { value, problem: null };
}
