import { describe, expect, it } from 'vitest';
import { startsWarranties } from './commissioning';

describe('startsWarranties', () => {
  it('is true for the commissioning task whatever its "When done" says', () => {
    expect(startsWarranties({ templateKey: 'testing_commissioning', onComplete: null })).toBe(true);
    expect(
      startsWarranties({
        templateKey: 'testing_commissioning',
        onComplete: 'installation_completed',
      }),
    ).toBe(true);
  });

  it('is true for any task set to commissioning or operational', () => {
    expect(startsWarranties({ templateKey: 'x', onComplete: 'commissioning_completed' })).toBe(
      true,
    );
    expect(startsWarranties({ templateKey: 'x', onComplete: 'project_operational' })).toBe(true);
  });

  it('is false for other tasks', () => {
    expect(startsWarranties({ templateKey: 'x', onComplete: 'installation_completed' })).toBe(
      false,
    );
    expect(startsWarranties({ templateKey: 'x', onComplete: null })).toBe(false);
  });
});
