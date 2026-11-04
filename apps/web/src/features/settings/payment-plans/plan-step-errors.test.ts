import { describe, expect, it } from 'vitest';
import { stepErrors } from './plan-step-errors';

describe('stepErrors', () => {
  const errors = {
    'steps.0.label': 'Name the payment.',
    'steps.1.shareBp': 'Use at least 1%.',
    'steps.1.trigger': 'Pick what makes it due.',
    'steps.10.label': 'Not this one.',
    total: 'Shares must add up to 100%.',
  };

  it('collects every error the API named for one step', () => {
    expect(stepErrors(errors, 1)).toEqual(['Use at least 1%.', 'Pick what makes it due.']);
    expect(stepErrors(errors, 0)).toEqual(['Name the payment.']);
  });

  it('is empty for a step with no errors', () => {
    expect(stepErrors(errors, 2)).toEqual([]);
  });
});
