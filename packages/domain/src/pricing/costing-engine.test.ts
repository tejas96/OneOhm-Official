import { describe, expect, it } from 'vitest';
import { cableRuns } from './cable-estimate';
import { card, rail, rupees } from './costing.fixtures';
import { crewDays } from './labour-estimate';
import { structureEstimate } from './structure-bom';

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
