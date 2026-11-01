import { describe, expect, it } from 'vitest';
import { changeKinds, flagsAfterChange, type ScopeChoices } from './change-kinds';
import { materialDelta, priceImpact, reservationExcess } from './change-money';

const accepted: ScopeChoices = {
  targetWp: 3000,
  panelProductId: 'panel-dcr',
  inverterProductId: 'inv-3',
  batteryProductId: null,
  structureType: 'rooftop',
  extras: [],
};

describe('what a change asks for', () => {
  it('names each kind of change in a fixed order', () => {
    expect(changeKinds(accepted, accepted)).toEqual([]);
    expect(
      changeKinds(accepted, {
        ...accepted,
        targetWp: 5000,
        batteryProductId: 'bat-5',
        panelProductId: 'panel-non-dcr',
        extras: [{ description: 'Extra earthing pit' }],
      }),
    ).toEqual(['capacity', 'battery_added', 'panel', 'extra_lines']);
  });

  it('tells adding, removing and swapping a battery apart', () => {
    const withBattery = { ...accepted, batteryProductId: 'bat-5' };
    expect(changeKinds(withBattery, accepted)).toEqual(['battery_removed']);
    expect(changeKinds(withBattery, { ...withBattery, batteryProductId: 'bat-10' })).toEqual([
      'battery_changed',
    ]);
  });

  it('sets the task flags from the change, keeping hand-set ones it does not touch', () => {
    const flags = { battery: false, groundMount: true, subsidy: true };
    expect(
      flagsAfterChange(flags, accepted, { ...accepted, batteryProductId: 'b' }, 7_800_000),
    ).toEqual({
      battery: true,
      groundMount: true,
      subsidy: true,
    });
    // Non-DCR panels: the subsidy goes, so its tasks go too.
    expect(
      flagsAfterChange(flags, accepted, { ...accepted, panelProductId: 'nd' }, 0).subsidy,
    ).toBe(false);
    expect(
      flagsAfterChange(flags, accepted, { ...accepted, structureType: 'ground_mount' }, 1)
        .groundMount,
    ).toBe(true);
  });
});

describe('money and material', () => {
  it('shows price, subsidy and effective cost moves: DCR → non-DCR on 3 kW', () => {
    const before = {
      totalPaise: 18_301_500,
      subsidyPaise: 7_800_000,
      subsidyIneligible: null,
      stateSupportPaise: 0,
      effectivePaise: 10_501_500,
      capacityWp: 3000,
    };
    // Cheaper panels (₹12,000 less) but the ₹78,000 subsidy is lost.
    const after = {
      ...before,
      totalPaise: 17_101_500,
      subsidyPaise: 0,
      subsidyIneligible: 'non_dcr_panels',
      effectivePaise: 17_101_500,
    };
    const impact = priceImpact(before, after);
    expect(impact.differencePaise).toBe(-1_200_000);
    expect(impact.subsidyDifferencePaise).toBe(-7_800_000);
    expect(impact.effectiveDifferencePaise).toBe(6_600_000);
  });

  it('lists only the material that changes', () => {
    expect(
      materialDelta(
        [
          { productId: 'panel', quantity: 6 },
          { productId: 'inverter', quantity: 1 },
          { productId: 'cable', quantity: 20.5 },
        ],
        [
          { productId: 'panel', quantity: 10 },
          { productId: 'inverter', quantity: 1 },
          { productId: 'cable', quantity: 18 },
          { productId: 'battery', quantity: 1 },
        ],
      ),
    ).toEqual([
      { productId: 'panel', before: 6, after: 10, delta: 4 },
      { productId: 'cable', before: 20.5, after: 18, delta: -2.5 },
      { productId: 'battery', before: 0, after: 1, delta: 1 },
    ]);
  });

  it('lets go of reserved stock beyond the new need, never more than is held', () => {
    expect(reservationExcess(10, 6, 0)).toBe(0);
    expect(reservationExcess(4, 6, 0)).toBe(2);
    expect(reservationExcess(4, 3, 3)).toBe(2);
    expect(reservationExcess(0, 1, 0)).toBe(1);
    expect(reservationExcess(0, 0, 2)).toBe(0);
  });
});
