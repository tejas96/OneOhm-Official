import {
  calculateStateTopUp,
  calculateSubsidy,
  ruleInForce,
  type StateTopUpRule,
  type SubsidyCategory,
  type SubsidyIneligibility,
  type SubsidyRule,
  type SystemType,
  stateRuleInForce,
} from '@oneohm/domain';

export interface SupportOnInput {
  readonly category: SubsidyCategory;
  readonly systemType: SystemType;
  readonly households: number | null;
  readonly capacityWp: number;
  readonly siteState: string;
  readonly lowIncomeHousehold: boolean;
  /** What the engine gave today, and the start dates of the rules it used. */
  readonly priced: {
    readonly subsidyPaise: number;
    readonly subsidyIneligible: SubsidyIneligibility | null;
    readonly stateSupportPaise: number;
    readonly ruleFrom: string | null;
    readonly stateRuleFrom: string | null;
  };
  readonly rules: readonly SubsidyRule[];
  readonly stateRules: readonly StateTopUpRule[];
  readonly date: string;
}

/**
 * Expected central subsidy and state top-up under the rules in force on `date`. The engine
 * priced with today's rules (eligibility, capacity, site facts); where a later rule applies,
 * an eligible quotation's amount is worked out again with that rule.
 */
export function supportOn(input: SupportOnInput): {
  readonly subsidyPaise: number;
  readonly stateSupportPaise: number;
} {
  const { priced } = input;
  const rule = ruleInForce(input.rules, input.category, input.date);
  const sameCentral = (rule?.validFrom ?? null) === priced.ruleFrom;
  const ineligible = priced.subsidyIneligible !== null && priced.subsidyIneligible !== 'no_rule';
  const central = ineligible
    ? { amountPaise: 0, eligibleWp: 0, ineligible: null }
    : calculateSubsidy(
        {
          category: input.category,
          capacityWp: input.capacityWp,
          panelsDcr: true,
          systemType: input.systemType,
          households: input.households ?? undefined,
        },
        rule,
      );
  const subsidyPaise = sameCentral ? priced.subsidyPaise : central.amountPaise;

  const stateRule = stateRuleInForce(input.stateRules, input.siteState, input.date);
  if (sameCentral && (stateRule?.validFrom ?? null) === priced.stateRuleFrom) {
    return { subsidyPaise, stateSupportPaise: priced.stateSupportPaise };
  }
  const state = calculateStateTopUp(
    {
      category: input.category,
      capacityWp: input.capacityWp,
      siteState: input.siteState,
      lowIncomeHousehold: input.lowIncomeHousehold,
      central: { ...central, amountPaise: subsidyPaise },
    },
    stateRule,
  );
  return { subsidyPaise, stateSupportPaise: state.amountPaise };
}
