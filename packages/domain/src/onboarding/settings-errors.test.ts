import { describe, expect, it } from 'vitest';
import { DEFAULT_ONBOARDING } from './settings';
import { onboardingFieldErrors } from './settings-errors';

const [a, b, c] = DEFAULT_ONBOARDING.billBands;
if (!a || !b || !c) throw new Error('defaults changed');

describe('onboardingFieldErrors', () => {
  it('finds nothing wrong with the defaults', () => {
    expect(onboardingFieldErrors(DEFAULT_ONBOARDING)).toEqual({});
  });

  it('marks the band whose limit does not rise, and an early "no limit"', () => {
    const errors = onboardingFieldErrors({
      ...DEFAULT_ONBOARDING,
      billBands: [b, { ...a, maxRupees: 1500 }, { ...c, maxRupees: null }, { ...c, id: 'z' }],
    });
    expect(Object.keys(errors).sort()).toEqual(['billBands.1.maxRupees', 'billBands.2.maxRupees']);
  });

  it('marks a blank label, a duplicate choice and the numbers that must be above zero', () => {
    const errors = onboardingFieldErrors({
      ...DEFAULT_ONBOARDING,
      billBands: [
        { ...a, label: ' ' },
        { ...b, id: a.id },
      ],
      tariffPaisePerUnit: 0,
      unitsPerKwMonth: 0,
      nudgeAfterHours: 30,
    });
    expect(Object.keys(errors).sort()).toEqual([
      'billBands.0.label',
      'billBands.1.label',
      'nudgeAfterHours',
      'tariffPaisePerUnit',
      'unitsPerKwMonth',
    ]);
  });

  it('marks the whole list when there are too few or too many choices or cities', () => {
    expect(onboardingFieldErrors({ ...DEFAULT_ONBOARDING, billBands: [a] })).toHaveProperty(
      'billBands',
    );
    const cities = Array.from({ length: 8 }, (_, i) => `City ${i}`);
    expect(onboardingFieldErrors({ ...DEFAULT_ONBOARDING, serviceCities: cities })).toHaveProperty(
      'serviceCities',
    );
  });
});
