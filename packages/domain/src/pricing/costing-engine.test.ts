import { describe, expect, it } from 'vitest';
import { cableRuns } from './cable-estimate';
import { costBuildup, personDays } from './cost-buildup';
import type { CostingCard, RateLine, SiteSetup } from './costing-card';
import { crewDays } from './labour-estimate';
import { priceQuote } from './quote-pricing';
import { structureEstimate } from './structure-bom';
import { designSystem } from './system-bom';

const rupees = (value: number) => value * 100;
const rate = (
  key: string,
  kind: RateLine['kind'],
  unit: string,
  price: number,
  cost: number,
): RateLine => ({
  key,
  label: key.replace(/_/g, ' '),
  kind,
  unit,
  pricePaise: rupees(price),
  costPaise: rupees(cost),
  tax: kind === 'labour' || kind === 'equipment' || kind === 'service' ? 'service' : 'goods',
  productId: kind === 'cable' ? `product-${key}` : null,
});

const rail: SiteSetup = {
  label: 'Aluminium rail',
  perKw: { pricePaise: rupees(3_500), costPaise: rupees(2_600) },
  heightM: 0.5,
  tiltDeg: 15,
  panelsPerRow: 6,
  parts: [
    { rate: 'rail', per: 'panel', qty: 2.3 },
    { rate: 'mid_clamp', per: 'gap', qty: 2 },
    { rate: 'end_clamp', per: 'row', qty: 4 },
    { rate: 'leg', per: 'panel', qty: 2, perHeightM: true },
  ],
  routes: [
    { kind: 'dc', cable: 'dc_4', routing: 'conduit', acrossM: 18, upPerFloorM: 3, runs: 2 },
    { kind: 'ac', cable: 'ac_6', routing: null, acrossM: 10, upPerFloorM: 3, runs: 1 },
  ],
  crew: [
    { rate: 'installer', workers: 2 },
    { rate: 'helper', workers: 1 },
  ],
  kwPerDay: 4,
  minDays: 1,
  equipment: [{ rate: 'scaffolding', qty: 2, fromFloor: 3 }],
};

const card: CostingCard = {
  version: 2,
  rateLines: [
    rate('rail', 'structure', 'm', 380, 300),
    rate('mid_clamp', 'structure', 'nos', 45, 32),
    rate('end_clamp', 'structure', 'nos', 45, 32),
    rate('leg', 'structure', 'm', 450, 350),
    rate('dc_4', 'cable', 'm', 60, 45),
    rate('ac_6', 'cable', 'm', 240, 185),
    rate('conduit', 'routing', 'm', 35, 25),
    rate('earthing', 'electrical', 'set', 9_000, 6_500),
    rate('installer', 'labour', 'day', 1_200, 900),
    rate('helper', 'labour', 'day', 700, 550),
    rate('extra_floor', 'labour', 'kW·floor', 500, 400),
    rate('scaffolding', 'equipment', 'day', 1_500, 1_200),
    rate('liaisoning', 'service', 'job', 6_000, 3_000),
  ],
  sites: {
    rcc_elevated: rail,
    tin_shed: rail,
    aluminium_rail: rail,
    ground_mount: rail,
    custom: { ...rail, parts: [] },
  },
  jobItems: [
    { rate: 'earthing', per: 'job', qty: 1 },
    { rate: 'liaisoning', per: 'job', qty: 1 },
  ],
  extraFloor: { rate: 'extra_floor', freeFloors: 2 },
  travel: {
    label: 'Travel to site',
    flatPaise: rupees(1_500),
    baseKm: 25,
    perKmPaise: rupees(25),
    roadFactorBp: 13_000,
    visits: 3,
  },
  accessBp: { easy: 0, moderate: 1_500, difficult: 3_000 },
  wastageBp: 500,
  overheadBp: 1_000,
  pricing: { mode: 'rates', marginBp: 2_000 },
  goodsTaxBp: 500,
  serviceTaxBp: 1_800,
  contingencyBp: 800,
  toleranceBp: 300,
};

const panel = {
  id: 'pnl',
  name: 'Module',
  unit: 'nos',
  pricePaise: rupees(14_200),
  costPaise: rupees(12_100),
  taxRateBp: 500,
  wattageWp: 545,
  dcr: true,
};
const inverter = {
  id: 'inv',
  name: 'Inverter 10 kW',
  unit: 'nos',
  pricePaise: rupees(62_000),
  costPaise: rupees(52_000),
  taxRateBp: 500,
};
const site = { floors: 3, structureType: 'aluminium_rail', distanceKm: 40 } as const;

describe('cable runs (PRD 3.9 A)', () => {
  it('defaults: 18 m across + 3 m a floor × 3 floors, 2 runs, 5% wastage → 56.7 m of DC cable', () => {
    const [dc, ac] = cableRuns({ site: rail, floors: 3, wastageBp: 500 });
    // Route 27 m; cable 27 × 2 × 1.05 = 56.7 m (₹3,402 at ₹60); conduit 28.35 m (₹992.25 at ₹35).
    expect(dc).toMatchObject({ upM: 9, cableM: 56.7, routeM: 28.35, basis: 'default' });
    expect(ac).toMatchObject({ cableM: 19.95, routing: null, basis: 'default' });
  });

  it('runs measured floor by floor replace that kind only; totals still work', () => {
    const runs = cableRuns({
      site: rail,
      floors: 3,
      wastageBp: 0,
      runs: [
        { kind: 'dc', floor: 3, acrossM: 12, upM: 0, runs: 2 },
        { kind: 'dc', floor: 2, acrossM: 0, upM: 6, runs: 2, routing: null },
      ],
      measured: { ac: 22 },
    });
    expect(runs.map((run) => [run.kind, run.cable, run.routing, run.cableM, run.basis])).toEqual([
      ['dc', 'dc_4', 'conduit', 24, 'survey'],
      ['dc', 'dc_4', null, 12, 'survey'],
      ['ac', 'ac_6', null, 22, 'survey'],
    ]);
  });
});

describe('structure BOM (PRD 3.9 C)', () => {
  it('a 3 × 6 aluminium rail arrangement is its real parts', () => {
    const estimate = structureEstimate({ site: rail, panels: 18, kw: 9.81 });
    expect(estimate.used).toMatchObject({ rows: 3, perKw: false });
    // Rail 41.4 m, 15 gaps × 2 = 30 mid clamps, 3 rows × 4 = 12 end clamps, legs 18 × 2 × 0.5 m.
    expect(estimate.needs.map((need) => [need.rate, need.quantity])).toEqual([
      ['rail', 41.4],
      ['mid_clamp', 30],
      ['end_clamp', 12],
      ['leg', 18],
    ]);
  });

  it('falls back to the per-kW benchmark only without parts', () => {
    const estimate = structureEstimate({ site: card.sites.custom, panels: 6, kw: 3.27 });
    expect(estimate.perKw).toMatchObject({ quantity: 3.27, pricePaise: rupees(3_500) });
  });
});

describe('labour and travel (PRD 3.9 B)', () => {
  it('crew days follow the size in half days, never below the minimum', () => {
    // 9.81 kW at 4 kW a day is 2.45 days, rounded up to 2.5.
    expect(crewDays(rail, 9.81)).toBe(2.5);
    expect(crewDays(rail, 1)).toBe(1);
    expect(crewDays(rail, 9.81, 2)).toBe(2);
  });
});

describe('the cost engine end to end', () => {
  const design = (overrides: Partial<Parameters<typeof designSystem>[0]> = {}) =>
    designSystem({ targetWp: 9_800, panel, inverter, site, rates: card, ...overrides });

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
    const { lines } = designSystem({ targetWp: 9_800, panel, inverter, site, rates: card });
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
