import { describe, expect, it } from 'vitest';
import { DEFAULT_MILESTONES, planMilestones } from './payment-milestones';
import { checkPaymentPlan, stepKey } from './payment-plan';

describe('payment plans', () => {
  it('accepts the standard plan', () => {
    expect(checkPaymentPlan(DEFAULT_MILESTONES)).toEqual({});
  });

  it('needs shares that make 100% and known events', () => {
    const errors = checkPaymentPlan([
      { key: 'a', label: 'Advance', shareBp: 3000, trigger: 'quotation_accepted' },
      { key: 'b', label: '', shareBp: 0, trigger: 'loan_disbursement' },
    ]);
    expect(errors.total).toMatch(/30%/);
    expect(errors['steps.1.label']).toBeDefined();
    expect(errors['steps.1.shareBp']).toBeDefined();
    expect(errors['steps.1.trigger']).toBeDefined();
  });

  it('splits a price by a custom 40/60 plan', () => {
    const plan = [
      { key: 'advance', label: 'Advance', shareBp: 4000, trigger: 'quotation_accepted' as const },
      {
        key: 'on_completion',
        label: 'On completion',
        shareBp: 6000,
        trigger: 'commissioning_completed' as const,
      },
    ];
    expect(planMilestones(100_000_00, plan).map((step) => step.amountPaise)).toEqual([
      40_000_00, 60_000_00,
    ]);
  });

  it('makes keys from labels', () => {
    expect(stepKey('Before dispatch!', 0)).toBe('before_dispatch');
    expect(stepKey('***', 2)).toBe('step_3');
  });
});
