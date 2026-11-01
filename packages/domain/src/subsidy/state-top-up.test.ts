import { describe, expect, it } from 'vitest';
import { calculateSubsidy } from './calculate-subsidy';
import {
  calculateStateTopUp,
  type StateTopUpInput,
  type StateTopUpRule,
  stateRuleInForce,
} from './state-top-up';
import { DEFAULT_SUBSIDY_RULES, ruleInForce } from './subsidy-rules';

const rupees = (value: number) => value * 100;

/** A made-up scheme for the examples: ₹10,000 per kW, at most ₹20,000. */
const scheme: StateTopUpRule = {
  state: 'Maharashtra',
  validFrom: '2026-11-01',
  paisePerKw: rupees(10_000),
  capPaise: rupees(20_000),
};

const central = (capacityWp: number, panelsDcr = true) =>
  calculateSubsidy(
    { category: 'individual', capacityWp, panelsDcr, systemType: 'on_grid' },
    ruleInForce(DEFAULT_SUBSIDY_RULES, 'individual', '2026-11-01'),
  );

const home = (capacityWp: number, extra: Partial<StateTopUpInput> = {}): StateTopUpInput => ({
  category: 'individual',
  capacityWp,
  siteState: 'Maharashtra',
  lowIncomeHousehold: true,
  central: central(capacityWp),
  ...extra,
});

describe('Maharashtra low-income top-up', () => {
  it('is ₹0 with no rule, so quotes stay as they are today', () => {
    expect(calculateStateTopUp(home(3000), null)).toEqual({
      amountPaise: 0,
      ineligible: 'no_rule',
    });
  });

  it('pays the rate per kW: 1.5 kW × ₹10,000 = ₹15,000', () => {
    expect(calculateStateTopUp(home(1500), scheme)).toEqual({
      amountPaise: rupees(15_000),
      ineligible: null,
    });
  });

  it('stops at the cap: 3 kW would be ₹30,000, capped at ₹20,000', () => {
    expect(calculateStateTopUp(home(3000), scheme).amountPaise).toBe(rupees(20_000));
  });

  it('is a separate line: the central ₹78,000 for 3 kW is untouched', () => {
    const input = home(3000);
    expect(input.central.amountPaise).toBe(rupees(78_000));
    expect(calculateStateTopUp(input, scheme).amountPaise).toBe(rupees(20_000));
  });

  it('needs the low-income flag on the property', () => {
    expect(calculateStateTopUp(home(2000, { lowIncomeHousehold: false }), scheme)).toEqual({
      amountPaise: 0,
      ineligible: 'not_low_income',
    });
  });

  it('is for homes only, in the rule’s own state', () => {
    expect(calculateStateTopUp(home(2000, { category: 'society' }), scheme).ineligible).toBe(
      'not_residential',
    );
    expect(calculateStateTopUp(home(2000, { siteState: 'Karnataka' }), scheme).ineligible).toBe(
      'other_state',
    );
    expect(
      calculateStateTopUp(home(2000, { siteState: ' maharashtra ' }), scheme).amountPaise,
    ).toBe(rupees(20_000));
  });

  it('follows the central eligibility: non-DCR panels lose both', () => {
    const nonDcr = home(2000, { central: central(2000, false) });
    expect(nonDcr.central.ineligible).toBe('non_dcr_panels');
    expect(calculateStateTopUp(nonDcr, scheme)).toEqual({
      amountPaise: 0,
      ineligible: 'no_central_subsidy',
    });
  });
});

describe('state rule versions', () => {
  const later: StateTopUpRule = { ...scheme, validFrom: '2027-04-01', paisePerKw: rupees(12_000) };

  it('uses the version in force on the day', () => {
    expect(stateRuleInForce([scheme, later], 'Maharashtra', '2026-10-31')).toBeNull();
    expect(stateRuleInForce([scheme, later], 'Maharashtra', '2026-12-01')).toBe(scheme);
    expect(stateRuleInForce([later, scheme], 'Maharashtra', '2027-04-01')).toBe(later);
    expect(stateRuleInForce([scheme], 'Gujarat', '2027-01-01')).toBeNull();
  });
});
