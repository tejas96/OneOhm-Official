import { describe, expect, it } from 'vitest';
import { planMilestones } from './payment-milestones';

describe('planMilestones', () => {
  const sum = (plan: readonly { amountPaise: number }[]) =>
    plan.reduce((total, item) => total + item.amountPaise, 0);

  it('splits 25 / 65 / 10 and gives rounding to the last', () => {
    const plan = planMilestones(3_33_333_33);
    expect(plan.map((item) => item.amountPaise)).toEqual([83_333_00, 2_16_667_00, 33_333_33]);
    expect(sum(plan)).toBe(3_33_333_33);
  });

  it('asks for whole rupees, not ₹45,992.25, and the last part keeps the sum exact', () => {
    const plan = planMilestones(1_83_969_00);
    expect(plan.map((item) => item.amountPaise)).toEqual([45_992_00, 1_19_580_00, 18_397_00]);
    expect(sum(plan)).toBe(1_83_969_00);
  });

  it('puts any paise of an odd total on the last customer milestone only', () => {
    const plan = planMilestones(1_83_969_25);
    const [advance = -1, dispatch = -1, last] = plan.map((item) => item.amountPaise);
    expect(advance % 100).toBe(0);
    expect(dispatch % 100).toBe(0);
    expect(last).toBe(1_83_969_25 - advance - dispatch);
    expect(sum(plan)).toBe(1_83_969_25);
  });

  it('rounds the customer share to whole rupees beside a loan, the bank share unchanged', () => {
    const plan = planMilestones(2_83_969_00, undefined, 1_00_000_50);
    const customer = plan.filter((item) => item.payer === 'customer');
    for (const item of customer.slice(0, -1)) expect(item.amountPaise % 100).toBe(0);
    expect(sum(customer)).toBe(2_83_969_00 - 1_00_000_50);
    expect(plan.find((item) => item.payer === 'bank')?.amountPaise).toBe(1_00_000_50);
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
