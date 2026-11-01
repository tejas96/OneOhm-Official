import type { SubsidyResult } from './calculate-subsidy';
import type { SubsidyCategory } from './subsidy-rules';

/**
 * A state's own support on top of PM Surya Ghar (PRD 3.5): Maharashtra has no general
 * top-up, only a scheme for low-income households. Like the central subsidy it is paid by
 * the government, so OneOhm only shows it; it is never revenue and never comes off the
 * invoice. Amounts are paise; capacities are watts-peak.
 */
export interface StateTopUpRule {
  /** The state whose sites it covers, as written on the property (e.g. "Maharashtra"). */
  readonly state: string;
  readonly validFrom: string;
  readonly paisePerKw: number;
  readonly capPaise: number;
}

export const DEFAULT_TOP_UP_STATE = 'Maharashtra';

export interface StateTopUpInput {
  readonly category: SubsidyCategory;
  readonly capacityWp: number;
  /** The site's state, from the property. */
  readonly siteState: string;
  /** Marked on the property, with its proof filed under "Income proof". */
  readonly lowIncomeHousehold: boolean;
  /** The central result: the state support follows the same eligibility (DCR, on-grid…). */
  readonly central: SubsidyResult;
}

export type StateTopUpIneligibility =
  | 'no_rule'
  | 'not_low_income'
  | 'not_residential'
  | 'other_state'
  | 'no_central_subsidy';

export interface StateTopUpResult {
  readonly amountPaise: number;
  /** Why it is ₹0, as a one-line reason key; null when it applies. */
  readonly ineligible: StateTopUpIneligibility | null;
}

const none = (ineligible: StateTopUpIneligibility): StateTopUpResult => ({
  amountPaise: 0,
  ineligible,
});

const sameState = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * Expected state support for a quotation. Only a low-income household's own home in the
 * rule's state gets it, and only when the system is eligible for the central subsidy
 * (DCR panels, on-grid or hybrid, one subsidy per property). The amount is the rule's
 * rate per kW of the eligible capacity, up to its cap. No rule: ₹0, as today.
 */
export function calculateStateTopUp(
  input: StateTopUpInput,
  rule: StateTopUpRule | null,
): StateTopUpResult {
  if (!rule) return none('no_rule');
  if (!input.lowIncomeHousehold) return none('not_low_income');
  if (input.category !== 'individual') return none('not_residential');
  if (!sameState(input.siteState, rule.state)) return none('other_state');
  if (input.central.amountPaise <= 0) return none('no_central_subsidy');
  const amount = Math.round((input.central.eligibleWp / 1000) * rule.paisePerKw);
  return { amountPaise: Math.min(amount, rule.capPaise), ineligible: null };
}

/** The state rule in force on a date (latest `validFrom` on or before it). */
export function stateRuleInForce(
  rules: readonly StateTopUpRule[],
  state: string,
  onDate: string,
): StateTopUpRule | null {
  const candidates = rules
    .filter((rule) => sameState(rule.state, state) && rule.validFrom <= onDate)
    .sort((left, right) => right.validFrom.localeCompare(left.validFrom));
  return candidates[0] ?? null;
}
