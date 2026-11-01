import type { SubsidyCategory, SubsidyRule } from './subsidy-rules';

export type SystemType = 'on_grid' | 'hybrid' | 'off_grid';

export interface SubsidyInput {
  readonly category: SubsidyCategory;
  readonly capacityWp: number;
  /** Every panel must be DCR (domestic cells) for any subsidy. */
  readonly panelsDcr: boolean;
  readonly systemType: SystemType;
  /** Societies only. */
  readonly households?: number | undefined;
  /** Societies: the meter must be in the society's name, not the builder's. */
  readonly meterInSocietyName?: boolean | undefined;
  /** One subsidy per property. */
  readonly propertyAlreadySubsidised?: boolean | undefined;
}

export type SubsidyIneligibility =
  | 'commercial'
  | 'non_dcr_panels'
  | 'off_grid'
  | 'meter_not_in_society_name'
  | 'already_subsidised'
  | 'no_rule';

export interface SubsidyResult {
  readonly amountPaise: number;
  readonly eligibleWp: number;
  /** Set when the subsidy is ₹0, as a one-line reason key. */
  readonly ineligible: SubsidyIneligibility | null;
}

const none = (ineligible: SubsidyIneligibility): SubsidyResult => ({
  amountPaise: 0,
  eligibleWp: 0,
  ineligible,
});

/**
 * Expected government subsidy for a quotation. OneOhm never pays or deducts it;
 * the quotation only shows it (PRD 3.5, 3.11).
 */
export function calculateSubsidy(input: SubsidyInput, rule: SubsidyRule | null): SubsidyResult {
  if (input.category === 'commercial') return none('commercial');
  if (!input.panelsDcr) return none('non_dcr_panels');
  if (input.systemType === 'off_grid') return none('off_grid');
  if (input.propertyAlreadySubsidised) return none('already_subsidised');
  if (input.category === 'society' && input.meterInSocietyName === false) {
    return none('meter_not_in_society_name');
  }
  if (!rule) return none('no_rule');

  let eligibleWp = input.capacityWp;
  if (input.category === 'society') {
    const households = Math.max(0, input.households ?? 0);
    if (rule.perHouseholdWp) eligibleWp = Math.min(eligibleWp, households * rule.perHouseholdWp);
    if (rule.maxEligibleWp) eligibleWp = Math.min(eligibleWp, rule.maxEligibleWp);
  }

  let amount = 0;
  for (const slab of rule.slabs) {
    const upper = slab.toWp === null ? eligibleWp : Math.min(eligibleWp, slab.toWp);
    const inSlabWp = Math.max(0, upper - slab.fromWp);
    amount += Math.round((inSlabWp / 1000) * slab.paisePerKw);
  }
  return { amountPaise: Math.min(amount, rule.capPaise), eligibleWp, ineligible: null };
}
