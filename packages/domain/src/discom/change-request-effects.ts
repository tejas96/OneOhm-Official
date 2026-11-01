import { SUBSIDY_CATEGORIES, type SubsidyCategory } from '../subsidy/subsidy-rules';
import { CHANGE_REQUEST_UPDATES, type ChangeRequestUpdateKey } from './change-request-catalog';
import type { ChangeRequestType } from './change-request-types';

/** The property's utility details a change request can update. */
export interface PropertyUtilityDetails {
  readonly meterHolderName: string | null;
  readonly subsidyCategory: SubsidyCategory;
  readonly phase: 'single' | 'three' | null;
  readonly sanctionedLoadW: number | null;
  readonly consumerNumber: string | null;
  readonly evMeterNumber: string | null;
}

export type PropertyUtilityPatch = Partial<{
  meterHolderName: string;
  subsidyCategory: SubsidyCategory;
  phase: 'single' | 'three';
  sanctionedLoadW: number;
  consumerNumber: string;
  evMeterNumber: string;
}>;

type Values = Readonly<Record<string, string>>;

const firstOf = (values: Values, keys: readonly string[]): string | undefined =>
  keys.map((key) => values[key]?.trim()).find((value) => Boolean(value));

/** One site detail's new value, from the request's own fields or what a step recorded. */
function updateValue(key: ChangeRequestUpdateKey, values: Values, captured: Values) {
  const source = CHANGE_REQUEST_UPDATES[key];
  const raw = firstOf(values, source.inputs) ?? firstOf(captured, source.captures);
  if (!raw) return undefined;
  if (key === 'phase') return raw === 'single' || raw === 'three' ? raw : undefined;
  if (key === 'subsidyCategory')
    return (SUBSIDY_CATEGORIES as readonly string[]).includes(raw) ? raw : undefined;
  if (key === 'sanctionedLoadW') {
    const kw = Number(raw);
    return Number.isFinite(kw) && kw > 0 ? Math.round(kw * 1000) : undefined;
  }
  return raw;
}

/**
 * What a completed change request writes to the property (PRD 3.15, step 5), and the
 * values it replaces so history keeps them. `updates` are the type's chosen site details;
 * `captured` holds details recorded by the request's steps, such as the new consumer number.
 */
export function changeRequestUpdate(
  updates: readonly ChangeRequestUpdateKey[],
  values: Values,
  captured: Values,
  current: PropertyUtilityDetails,
): { readonly patch: PropertyUtilityPatch; readonly previous: Record<string, unknown> } {
  const patch: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  for (const key of updates) {
    const value = updateValue(key, values, captured);
    if (value === undefined) continue;
    patch[key] = value;
    previous[key] = current[key];
  }
  return { patch: patch as PropertyUtilityPatch, previous };
}

export interface ChangeRequestSuggestion {
  readonly type: ChangeRequestType;
  readonly reason: string;
}

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Mismatches worth a change request (PRD 3.15, step 2): the meter holder is not the
 * customer, the solar system is bigger than the sanctioned load, or the site has no
 * connection yet.
 */
export function suggestChangeRequests(input: {
  readonly customerName: string;
  readonly meterHolderName: string | null;
  readonly sanctionedLoadW: number | null;
  readonly consumerNumber: string | null;
  readonly proposedCapacityWp: number | null;
}): ChangeRequestSuggestion[] {
  const suggestions: ChangeRequestSuggestion[] = [];
  if (!input.consumerNumber) {
    suggestions.push({ type: 'new_connection', reason: 'The site has no consumer number yet.' });
  }
  const holder = input.meterHolderName?.trim();
  if (holder && normalise(holder) !== normalise(input.customerName)) {
    const sameLetters =
      [...normalise(holder)].sort().join('') === [...normalise(input.customerName)].sort().join('');
    suggestions.push({
      type: sameLetters ? 'name_spelling_correction' : 'consumer_name_change',
      reason: `The meter is in the name "${holder}", not "${input.customerName}".`,
    });
  }
  if (
    input.proposedCapacityWp &&
    input.sanctionedLoadW &&
    input.proposedCapacityWp > input.sanctionedLoadW
  ) {
    suggestions.push({
      type: 'load_change',
      reason: `The proposed ${input.proposedCapacityWp / 1000} kWp is more than the sanctioned ${input.sanctionedLoadW / 1000} kW.`,
    });
  }
  return suggestions;
}
