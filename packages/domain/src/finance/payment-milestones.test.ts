import { describe, expect, it } from 'vitest';
import { planMilestones } from './payment-milestones';

describe('planMilestones', () => {
  const sum = (plan: readonly { amountPaise: number }[]) =>
    plan.reduce((total, item) => total + item.amountPaise, 0);

  it('splits 25 / 65 / 10 and gives rounding to the last', () => {
    const plan = planMilestones(3_33_333_33);
    expect(plan.map((item) => item.amountPaise)).toEqual([83_333_00, 2_16_666_00, 33_334_33]);
    expect(sum(plan)).toBe(3_33_333_33);
  });

  it('asks for whole rupees, not ₹45,992.25, and the last part keeps the sum exact', () => {
    const plan = planMilestones(1_83_969_00);
    expect(plan.map((item) => item.amountPaise)).toEqual([45_992_00, 1_19_579_00, 18_398_00]);
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

  it('keeps tiny or odd splits exact, with no empty or negative instalment', () => {
    const steps = [
      { key: 'a', label: 'A', shareBp: 1, trigger: 'quotation_accepted' as const },
      { key: 'b', label: 'B', shareBp: 1, trigger: 'material_dispatch' as const },
      { key: 'c', label: 'C', shareBp: 9998, trigger: 'commissioning_completed' as const },
    ];
    for (const total of [1, 99, 1_00, 2_50, 1_83_969_25]) {
      for (const plan of [planMilestones(total), planMilestones(total, steps)]) {
        expect(sum(plan)).toBe(total);
        for (const item of plan) expect(item.amountPaise).toBeGreaterThan(0);
      }
    }
    // The last instalment is never below its exact share.
    const plan = planMilestones(1_83_969_00);
    expect(plan.at(-1)?.amountPaise).toBeGreaterThanOrEqual(1_83_969_00 * 0.1);
  });
});
