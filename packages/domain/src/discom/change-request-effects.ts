import type { SubsidyCategory } from '../subsidy/subsidy-rules';
import type { ChangeRequestType } from './change-request-types';

/** The property's utility details a change request can update. */
export interface PropertyUtilityDetails {
  readonly meterHolderName: string | null;
  readonly subsidyCategory: SubsidyCategory;
  readonly phase: 'single' | 'three' | null;
  readonly sanctionedLoadW: number | null;
  readonly consumerNumber: string | null;
}

export type PropertyUtilityPatch = Partial<{
  meterHolderName: string;
  subsidyCategory: SubsidyCategory;
  phase: 'single' | 'three';
  sanctionedLoadW: number;
  consumerNumber: string;
}>;

/**
 * What a completed change request writes to the property (PRD 3.15, step 5), and the
 * values it replaces so history keeps them. `captured` holds details recorded by the
 * request's steps, such as the new consumer number.
 */
type Values = Readonly<Record<string, string>>;

const phaseOf = (values: Values): PropertyUtilityPatch =>
  values.phase === 'single' || values.phase === 'three' ? { phase: values.phase } : {};

const loadOf = (values: Values): PropertyUtilityPatch => {
  const kw = Number(values.newLoadKw);
  return Number.isFinite(kw) && kw > 0 ? { sanctionedLoadW: Math.round(kw * 1000) } : {};
};

const UPDATES: Readonly<
  Record<ChangeRequestType, (values: Values, captured: Values) => PropertyUtilityPatch>
> = {
  consumer_name_change: (values) => (values.newName ? { meterHolderName: values.newName } : {}),
  name_spelling_correction: (values) =>
    values.correctedName ? { meterHolderName: values.correctedName } : {},
  property_type_change: (values) =>
    values.newCategory ? { subsidyCategory: values.newCategory as SubsidyCategory } : {},
  load_change: (values) => ({ ...phaseOf(values), ...loadOf(values) }),
  new_ev_meter: () => ({}),
  new_connection: (values, captured) => ({
    ...phaseOf(values),
    ...(captured.consumer_number ? { consumerNumber: captured.consumer_number } : {}),
  }),
};

export function changeRequestUpdate(
  type: ChangeRequestType,
  values: Values,
  captured: Values,
  current: PropertyUtilityDetails,
): { readonly patch: PropertyUtilityPatch; readonly previous: Record<string, unknown> } {
  const patch = UPDATES[type](values, captured);
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof PropertyUtilityPatch)[]) {
    previous[key] = current[key];
  }
  return { patch, previous };
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
