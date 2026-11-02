// Relative, so the unit tests (no path aliases) can load it.
import { QUOTE } from '../../copy/quote';
import type { QuoteForm } from './quote-inputs';
import { parseKw } from './quote-options';

/** A whole number typed as digits only; null for anything else. */
export function whole(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const MAX_FLOORS = 40;
const MAX_DISTANCE_KM = 1000;

/**
 * Numbers typed outside what the server accepts, keyed like the request's fields so
 * they show under the same inputs as the server's messages.
 */
export function quoteFormChecks(
  form: QuoteForm,
  society: boolean,
): Readonly<Record<string, string>> {
  const checks: Record<string, string> = {};
  if (form.sizeKw.trim() && parseKw(form.sizeKw) === null) checks.targetWp = QUOTE.checks.size;
  const floors = whole(form.floors);
  if (form.floors.trim() && (floors === null || floors > MAX_FLOORS))
    checks.floors = QUOTE.checks.floors;
  const distance = whole(form.distanceKm);
  if (form.distanceKm.trim() && (distance === null || distance > MAX_DISTANCE_KM))
    checks.distanceKm = QUOTE.checks.distance;
  if (society && form.households.trim()) {
    const households = whole(form.households);
    if (households === null || households < 1) checks.households = QUOTE.checks.households;
  }
  return checks;
}
