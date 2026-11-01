import { describe, expect, it } from 'vitest';
import { calculateSubsidy, type SubsidyInput } from './calculate-subsidy';
import { DEFAULT_SUBSIDY_RULES, ruleInForce, type SubsidyRule } from './subsidy-rules';

const rupees = (value: number) => value * 100;
const rule = (category: SubsidyInput['category']) =>
  ruleInForce(DEFAULT_SUBSIDY_RULES, category, '2026-11-01');
const home = (capacityWp: number, extra: Partial<SubsidyInput> = {}): SubsidyInput => ({
  category: 'individual',
  capacityWp,
  panelsDcr: true,
  systemType: 'on_grid',
  ...extra,
});

describe('individual homes', () => {
  it('pays ₹30,000 per kW for the first 2 kW', () => {
    expect(calculateSubsidy(home(1000), rule('individual')).amountPaise).toBe(rupees(30_000));
    expect(calculateSubsidy(home(2000), rule('individual')).amountPaise).toBe(rupees(60_000));
  });

  it('adds ₹18,000 for the third kW and caps at ₹78,000', () => {
    expect(calculateSubsidy(home(3000), rule('individual')).amountPaise).toBe(rupees(78_000));
    expect(calculateSubsidy(home(5400), rule('individual')).amountPaise).toBe(rupees(78_000));
    expect(calculateSubsidy(home(2500), rule('individual')).amountPaise).toBe(rupees(69_000));
  });

  it('gives ₹0 with a reason for non-DCR panels or off-grid systems', () => {
    expect(calculateSubsidy(home(3000, { panelsDcr: false }), rule('individual'))).toEqual({
      amountPaise: 0,
      eligibleWp: 0,
      ineligible: 'non_dcr_panels',
    });
    expect(
      calculateSubsidy(home(3000, { systemType: 'off_grid' }), rule('individual')).ineligible,
    ).toBe('off_grid');
    expect(
      calculateSubsidy(home(3000, { systemType: 'hybrid' }), rule('individual')).amountPaise,
    ).toBe(rupees(78_000));
  });

  it('allows one subsidy per property', () => {
    const result = calculateSubsidy(
      home(3000, { propertyAlreadySubsidised: true }),
      rule('individual'),
    );
    expect(result.ineligible).toBe('already_subsidised');
  });
});

describe('housing societies', () => {
  const society = (capacityWp: number, households: number, extra: Partial<SubsidyInput> = {}) =>
    calculateSubsidy(
      {
        category: 'society',
        capacityWp,
        households,
        panelsDcr: true,
        systemType: 'on_grid',
        ...extra,
      },
      rule('society'),
    );

  it('pays ₹18,000 per kW on the lower of households × 3 kW and installed capacity', () => {
    expect(society(48_000, 20).amountPaise).toBe(rupees(18_000 * 48));
    expect(society(48_000, 10).eligibleWp).toBe(30_000);
    expect(society(48_000, 10).amountPaise).toBe(rupees(18_000 * 30));
  });

  it('caps eligible capacity at 500 kW and the amount at ₹90 lakh', () => {
    const result = society(700_000, 400);
    expect(result.eligibleWp).toBe(500_000);
    expect(result.amountPaise).toBe(rupees(90_00_000));
  });

  it('needs the meter in the society name', () => {
    expect(society(30_000, 10, { meterInSocietyName: false }).ineligible).toBe(
      'meter_not_in_society_name',
    );
  });
});

describe('commercial', () => {
  it('is never eligible', () => {
    const result = calculateSubsidy(
      { category: 'commercial', capacityWp: 25_000, panelsDcr: true, systemType: 'on_grid' },
      rule('commercial'),
    );
    expect(result).toEqual({ amountPaise: 0, eligibleWp: 0, ineligible: 'commercial' });
  });
});

describe('rule in force', () => {
  it('picks the latest rule on or before the date', () => {
    const individual = DEFAULT_SUBSIDY_RULES.find((rule) => rule.category === 'individual');
    if (!individual) throw new Error('missing rule');
    const later: SubsidyRule = { ...individual, validFrom: '2027-04-01', capPaise: 1 };
    const rules: SubsidyRule[] = [...DEFAULT_SUBSIDY_RULES, later];
    expect(ruleInForce(rules, 'individual', '2026-11-01')?.capPaise).toBe(rupees(78_000));
    expect(ruleInForce(rules, 'individual', '2027-05-01')?.capPaise).toBe(1);
  });
});
