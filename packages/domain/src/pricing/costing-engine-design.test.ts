import { describe, expect, it } from 'vitest';
import { costBuildup, personDays } from './cost-buildup';
import { card, inverter, panel, rupees, site } from './costing.fixtures';
import type { CostingCard } from './costing-card';
import { priceQuote } from './quote-pricing';
import { designSystem } from './system-bom';

describe('the cost engine end to end', () => {
  const design = (overrides: Partial<Parameters<typeof designSystem>[0]> = {}) =>
    designSystem({
      targetWp: 9_800,
      panel,
      inverters: [{ product: inverter, quantity: 1 }],
      site,
      rates: card,
      ...overrides,
    });

  it('orders lines by stage and names each product', () => {
    const { lines } = design();
    expect(lines.map((line) => line.key)).toEqual([
      'panel',
      'inverter',
      'rail',
      'mid_clamp',
      'end_clamp',
      'leg',
      'dc_4',
      'ac_6',
      'conduit',
      'earthing',
      'installer',
      'helper',
      'extra_floor',
      'scaffolding',
      'transport',
      'liaisoning',
    ]);
    expect(lines.find((line) => line.key === 'dc_4')?.productId).toBe('product-dc_4');
    expect(lines.find((line) => line.key === 'panel')?.productId).toBe('pnl');
  });

  it('labour: 2 installers + 1 helper × 2.5 days; difficult access adds 30%', () => {
    const easy = Object.fromEntries(design().lines.map((line) => [line.key, line.quantity]));
    expect([
      easy.installer,
      easy.helper,
      easy.extra_floor,
      easy.scaffolding,
      easy.transport,
    ]).toEqual([5, 2.5, 9.81, 2, 3]);
    const hard = design({ detail: { access: 'difficult', visits: 2 } });
    const keyed = Object.fromEntries(hard.lines.map((line) => [line.key, line.quantity]));
    expect([keyed.installer, keyed.helper, keyed.extra_floor, keyed.transport]).toEqual([
      6.5, 3.25, 12.75, 2,
    ]);
    expect(personDays(card, hard.lines)).toBeCloseTo(9.75);
  });

  it('what the quotation sets counts as measured, with no contingency', () => {
    const { lines } = design({ detail: { days: 2, structure: { heightM: 1 } } });
    const keyed = Object.fromEntries(lines.map((line) => [line.key, line]));
    expect(keyed.installer).toMatchObject({ quantity: 4, basis: 'survey' });
    expect(keyed.leg).toMatchObject({ quantity: 36, basis: 'survey' });
  });

  it('target margin: price = cost × (1 + overhead) ÷ (1 − margin)', () => {
    const marginCard: CostingCard = { ...card, pricing: { mode: 'margin', marginBp: 2_000 } };
    const { lines } = design({ rates: marginCard });
    // A ₹45 cable metre with 10% overhead and a 20% margin sells at ₹61.875.
    expect(lines.find((line) => line.key === 'dc_4')?.unitPricePaise).toBe(6_188);
    expect(lines.find((line) => line.key === 'panel')?.unitPricePaise).toBe(rupees(16_637.5));
  });
});

describe('cost build-up', () => {
  it('splits the cost, adds overhead and shows the margin left', () => {
    const { lines } = designSystem({
      targetWp: 9_800,
      panel,
      inverters: [{ product: inverter, quantity: 1 }],
      site,
      rates: card,
    });
    const priced = priceQuote(lines, { contingencyBp: 800, discountPaise: 0 });
    const build = costBuildup(card, priced.lines);
    expect(build.labourPaise).toBe(rupees(5 * 900 + 2.5 * 550) + Math.round(9.81 * 40_000));
    expect(build.equipmentPaise).toBe(rupees(2_400));
    expect(build.travelPaise).toBe(rupees(3 * 1_875));
    expect(build.directCostPaise).toBe(priced.costPaise);
    expect(build.overheadPaise).toBe(Math.round(priced.costPaise / 1_000) * 100);
    expect(build.marginPaise).toBe(priced.marginPaise - build.overheadPaise);
  });
});
