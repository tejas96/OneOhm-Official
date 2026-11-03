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
  it('gives no payback when nothing is saved', () => {
    expect(savingAndPayback(0, 100, d)).toEqual({ monthlySavingPaise: 0, paybackYears: 0 });
  });
});
