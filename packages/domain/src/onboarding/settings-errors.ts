import {
  type BillBand,
  MAX_BILL_BANDS,
  MAX_NUDGE_AFTER_HOURS,
  MAX_ROW_TITLE,
  MAX_SERVICE_CITIES,
  MIN_BILL_BANDS,
  type OnboardingSettings,
} from './settings';

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';

const tooLong = (value: string | undefined) => value !== undefined && value.length > MAX_ROW_TITLE;

/** The label's problem: blank, too long, or a repeat of a choice above. */
function labelError(band: Partial<BillBand>, seen: ReadonlySet<string>): string | null {
  if (blank(band.label)) return 'Name this choice.';
  if (tooLong(band.label)) return `At most ${MAX_ROW_TITLE} characters.`;
  if (band.id && seen.has(band.id)) return 'This choice is a repeat.';
  return null;
}

/** "Up to ₹" must rise down the list; only the last choice may have no limit. */
function maxError(band: Partial<BillBand>, isLast: boolean, previous: number): string | null {
  const max = band.maxRupees;
  if (max === undefined) return null;
  if (max === null) return isLast ? null : 'Only the last choice can have no limit.';
  return isPositive(max) && max > previous
    ? null
    : `Enter more than ₹${previous.toLocaleString('en-IN')}, the choice above.`;
}

const sizeError = (targetWp: number | null | undefined) =>
  targetWp === null || isPositive(targetWp)
    ? null
    : 'Enter a size above 0, or leave it empty for an expert.';
const longError = (value: string | undefined) =>
  tooLong(value) ? `At most ${MAX_ROW_TITLE} characters.` : null;

function rowErrors(
  band: Partial<BillBand>,
  isLast: boolean,
  previous: number,
  seen: ReadonlySet<string>,
): Record<string, string | null> {
  return {
    label: labelError(band, seen),
    labelMr: longError(band.labelMr),
    labelHi: longError(band.labelHi),
    targetWp: sizeError(band.targetWp),
    maxRupees: maxError(band, isLast, previous),
  };
}

function bandErrors(bands: readonly Partial<BillBand>[], errors: Record<string, string>) {
  if (bands.length < MIN_BILL_BANDS) errors.billBands = `Add at least ${MIN_BILL_BANDS} choices.`;
  if (bands.length > MAX_BILL_BANDS) errors.billBands = `At most ${MAX_BILL_BANDS} choices.`;
  const seen = new Set<string>();
  let previous = 0;
  for (const [index, band] of bands.entries()) {
    const found = rowErrors(band, index === bands.length - 1, previous, seen);
    for (const [field, message] of Object.entries(found))
      if (message) errors[`billBands.${index}.${field}`] = message;
    if (band.id) seen.add(band.id);
    if (!found.maxRupees && typeof band.maxRupees === 'number') previous = band.maxRupees;
  }
}

/**
 * What is wrong with onboarding settings, keyed by field path (`billBands.2.maxRupees`)
 * so each message shows under its own input. Empty when they can be saved.
 */
export function onboardingFieldErrors(value: Partial<OnboardingSettings>): Record<string, string> {
  const errors: Record<string, string> = {};
  const cities = value.serviceCities ?? [];
  if (cities.length > MAX_SERVICE_CITIES)
    errors.serviceCities = `At most ${MAX_SERVICE_CITIES} cities.`;
  else if (cities.some((city) => blank(city) || city.length > MAX_ROW_TITLE))
    errors.serviceCities = `Each city needs a name of at most ${MAX_ROW_TITLE} characters.`;
  bandErrors(value.billBands ?? [], errors);
  if (!isPositive(value.tariffPaisePerUnit))
    errors.tariffPaisePerUnit = 'Enter an amount greater than zero.';
  if (!isPositive(value.unitsPerKwMonth))
    errors.unitsPerKwMonth = 'Enter a number greater than zero.';
  const nudge = value.nudgeAfterHours;
  if (
    typeof nudge !== 'number' ||
    !Number.isFinite(nudge) ||
    nudge < 0 ||
    nudge > MAX_NUDGE_AFTER_HOURS
  )
    errors.nudgeAfterHours = `Enter 0 to ${MAX_NUDGE_AFTER_HOURS} hours.`;
  return errors;
}
