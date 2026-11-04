import type { StateTopUpRule, SubsidyRule } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { supportOn } from './subsidy-on-date';

const central: SubsidyRule = {
  category: 'individual',
  validFrom: '2026-01-01',
  slabs: [{ fromWp: 0, toWp: null, paisePerKw: 3_000_000 }],
  capPaise: 7_800_000,
};
const stateToday: StateTopUpRule = {
  state: 'Maharashtra',
  validFrom: '2026-01-01',
  paisePerKw: 500_000,
  capPaise: 1_500_000,
};
const stateLater: StateTopUpRule = {
  ...stateToday,
  validFrom: '2026-12-01',
  paisePerKw: 1_000_000,
};

const base = {
  category: 'individual' as const,
  systemType: 'on_grid' as const,
  households: null,
  capacityWp: 2000,
  siteState: 'Maharashtra',
  lowIncomeHousehold: true,
  priced: {
    subsidyPaise: 6_000_000,
    subsidyIneligible: null,
    stateSupportPaise: 1_000_000,
    ruleFrom: '2026-01-01',
    stateRuleFrom: '2026-01-01',
  },
  rules: [central],
};

describe('support on a date', () => {
  it('keeps the priced amounts when the same rules are in force', () => {
    expect(
      supportOn({ ...base, stateRules: [stateToday, stateLater], date: '2026-11-04' }),
    ).toEqual({ subsidyPaise: 6_000_000, stateSupportPaise: 1_000_000 });
  });

  it('works out the state top-up again under a later state rule', () => {
    expect(
      supportOn({ ...base, stateRules: [stateToday, stateLater], date: '2026-12-01' }),
    ).toEqual({ subsidyPaise: 6_000_000, stateSupportPaise: 1_500_000 });
  });

  it('gives no state top-up when the household is not low-income', () => {
    expect(
      supportOn({
        ...base,
        lowIncomeHousehold: false,
        stateRules: [stateToday, stateLater],
        date: '2026-12-01',
      }).stateSupportPaise,
    ).toBe(0);
  });
});
