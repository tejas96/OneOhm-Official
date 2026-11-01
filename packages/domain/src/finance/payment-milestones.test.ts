import { describe, expect, it } from 'vitest';
import { planMilestones } from './payment-milestones';

describe('planMilestones', () => {
  it('splits 25 / 65 / 10 and gives rounding to the last', () => {
    const plan = planMilestones(3_33_333_33);
    expect(plan.map((item) => item.amountPaise)).toEqual([83_33_333, 2_16_66_666, 33_33_334]);
    expect(plan.reduce((sum, item) => sum + item.amountPaise, 0)).toBe(3_33_333_33);
  });

  it('turns the loan into a separate bank receivable', () => {
    const plan = planMilestones(4_00_000_00, undefined, 3_00_000_00);
    const bank = plan.filter((item) => item.payer === 'bank');
    expect(bank).toHaveLength(1);
    expect(bank[0]?.amountPaise).toBe(3_00_000_00);
    const customer = plan.filter((item) => item.payer === 'customer');
    expect(customer.reduce((sum, item) => sum + item.amountPaise, 0)).toBe(1_00_000_00);
  });
});
