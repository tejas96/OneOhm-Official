import { describe, expect, it } from 'vitest';
import { newStepKey } from './lead-steps';

describe('newStepKey', () => {
  it('makes a short key from a Latin name', () => {
    expect(newStepKey('Loan check', [])).toBe('loan_check');
  });

  it('adds a number when the key is taken, e.g. by a renamed step', () => {
    // "New" was renamed "Fresh" but kept its key; a new "New" still gets one.
    expect(newStepKey('New', ['new'])).toBe('new_2');
    expect(newStepKey('New', ['new', 'new_2'])).toBe('new_3');
  });

  it('works for names in any script', () => {
    expect(newStepKey('नवीन', [])).toBe('step');
    expect(newStepKey('संपर्क केला', ['step'])).toBe('step_2');
  });

  it('keeps keys short enough for the address bar', () => {
    expect(newStepKey('a'.repeat(80), []).length).toBeLessThanOrEqual(50);
  });
});
