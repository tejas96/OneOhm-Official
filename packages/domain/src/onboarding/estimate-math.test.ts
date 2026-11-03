import { describe, expect, it } from 'vitest';
import { pricingInputsFor, savingAndPayback } from './estimate-math';
import { DEFAULT_ONBOARDING } from './settings';

const d = DEFAULT_ONBOARDING;

describe('pricingInputsFor', () => {
  it('prices a home with an RCC roof', () => {
    expect(
      pricingInputsFor({ site: 'home', bill: '2000_3000', roof: 'rcc', floors: 2 }, d),
    ).toEqual({
      kind: 'priceable',
      subsidyCategory: 'individual',
      structureType: 'rcc_elevated',
      floors: 2,
      targetWp: 3000,
    });
  });
  it('prices a business on a tin roof as commercial, one floor when not asked', () => {
    expect(pricingInputsFor({ site: 'business', bill: 'up_to_1000', roof: 'tin' }, d)).toEqual({
      kind: 'priceable',
      subsidyCategory: 'commercial',
      structureType: 'tin_shed',
      floors: 1,
      targetWp: 1000,
    });
  });
  it('sends the rest to an expert', () => {
    const base = { site: 'home', bill: '1000_2000', roof: 'rcc' } as const;
    expect(pricingInputsFor({ ...base, site: 'farm' }, d)).toEqual({
      kind: 'expert',
      reason: 'farm',
    });
    expect(pricingInputsFor({ ...base, site: 'society' }, d)).toEqual({
      kind: 'expert',
      reason: 'society',
    });
    expect(pricingInputsFor({ ...base, roof: 'other' }, d)).toEqual({
      kind: 'expert',
      reason: 'roof_other',
    });
    expect(pricingInputsFor({ ...base, bill: 'over_5000' }, d)).toEqual({
      kind: 'expert',
      reason: 'large_bill',
    });
    expect(pricingInputsFor({ site: 'home' }, d)).toEqual({ kind: 'expert', reason: 'missing' });
    expect(pricingInputsFor({ ...base, bill: 'gone' }, d)).toEqual({
      kind: 'expert',
      reason: 'missing',
    });
  });
});

describe('savingAndPayback', () => {
  it('works out the saving and rounds payback to half a year', () => {
    expect(savingAndPayback(3000, 10_700_000, d)).toEqual({
      monthlySavingPaise: 288_000,
      paybackYears: 3,
    });
    expect(savingAndPayback(3000, 12_000_000, d).paybackYears).toBe(3.5);
  });
  // Live review C2: a 3.27 kW system "saves ₹3,139" on a ₹2,000–3,000 bill; it is capped.
  it('never saves more a month than the top of the chosen bill band', () => {
    expect(savingAndPayback(3270, 10_596_900, d, '2000_3000')).toEqual({
      monthlySavingPaise: 300_000,
      paybackYears: 3,
    });
    expect(savingAndPayback(3000, 10_700_000, d, '2000_3000').monthlySavingPaise).toBe(288_000);
  });
  it('reads the cap from the label when the band has no typed-amount limit', () => {
    const bands = [{ id: 'a', label: '₹2,000–2,500', targetWp: 3000 }];
    const settings = { ...d, billBands: bands };
    expect(savingAndPayback(3270, 10_596_900, settings, 'a').monthlySavingPaise).toBe(250_000);
    // The open top band has no cap.
    expect(savingAndPayback(9000, 1, d, 'over_5000').monthlySavingPaise).toBe(864_000);
  });
  it('gives no payback when nothing is saved', () => {
    expect(savingAndPayback(0, 100, d)).toEqual({ monthlySavingPaise: 0, paybackYears: 0 });
  });
});
