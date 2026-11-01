import { describe, expect, it } from 'vitest';
import { type ContractorRate, workOrderLines } from './work-order-rates';
import { settleWorkOrder } from './work-order-settlement';

const rate = (overrides: Partial<ContractorRate>): ContractorRate => ({
  id: 'r',
  basis: 'per_kwp',
  taskKey: null,
  projectType: null,
  label: 'Installation',
  amountPaise: 300_000,
  ...overrides,
});

describe('workOrderLines', () => {
  it('pays per kWp for the installed capacity, rounded to the rupee', () => {
    const lines = workOrderLines({
      rates: [rate({ amountPaise: 350_000 })],
      tasks: [],
      capacityWp: 5450,
      projectType: 'residential',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.amountPaise).toBe(1_907_500);
    expect(lines[0]?.quantityMilli).toBe(5450);
  });

  it('prefers the rate for the project type and adds per-task rates', () => {
    const lines = workOrderLines({
      rates: [
        rate({ id: 'any', amountPaise: 300_000 }),
        rate({ id: 'society', projectType: 'society', amountPaise: 250_000 }),
        rate({
          id: 'bat',
          basis: 'per_task',
          taskKey: 'battery_installation',
          amountPaise: 150_000,
        }),
      ],
      tasks: [
        { templateKey: 'battery_installation', title: 'Install battery' },
        { templateKey: 'panel_installation', title: 'Install panels' },
      ],
      capacityWp: 10_000,
      projectType: 'society',
    });
    expect(lines.map((line) => line.rateId)).toEqual(['society', 'bat']);
    expect(lines[0]?.amountPaise).toBe(2_500_000);
  });
});

describe('settleWorkOrder', () => {
  it('deducts rework first, then retention, TDS and advances', () => {
    const settlement = settleWorkOrder({
      lineAmountsPaise: [1_907_500, 150_000],
      reworkDeductionsPaise: 57_500,
      advancesPaise: 500_000,
      retentionBp: 500,
      tdsBp: 100,
    });
    expect(settlement.grossPaise).toBe(2_057_500);
    expect(settlement.retentionPaise).toBe(100_000);
    expect(settlement.tdsPaise).toBe(20_000);
    expect(settlement.netPayablePaise).toBe(2_000_000 - 100_000 - 20_000 - 500_000);
  });

  it('never goes below zero when advances exceed the balance', () => {
    const settlement = settleWorkOrder({
      lineAmountsPaise: [100_000],
      reworkDeductionsPaise: 0,
      advancesPaise: 500_000,
      retentionBp: 0,
      tdsBp: 0,
    });
    expect(settlement.netPayablePaise).toBe(0);
  });
});
