import { describe, expect, it } from 'vitest';
import { cableTotal, formatCableRuns, parseCableRuns } from './cable-run-text';
import { cardProblems, detailProblems, rateUses } from './card-checks';
import { installEstimate } from './install-estimate';
import { tripPaise } from './labour-estimate';
import { cardFromLegacy, type LegacyRateCard } from './legacy-card';
import { geoPoint, roadDistanceKm } from './site-distance';

const pair = { price: 100_00, cost: 80_00 };
const cable = { baseMeters: 20, perFloorMeters: 5, price: 100_00, cost: 80_00 };
const OLD: LegacyRateCard = {
  structurePerKw: { rcc_elevated: pair, tin_shed: pair, ground_mount: pair },
  dcCable: cable,
  acCable: cable,
  earthingKit: pair,
  protectionKit: pair,
  installationPerKw: pair,
  extraFloorPerKw: pair,
  freeFloors: 2,
  transport: { baseKm: 10, perKm: 10_00, flat: 500_00 },
  liaisoning: pair,
  goodsTaxBp: 500,
  serviceTaxBp: 1800,
  contingencyBp: 1000,
  toleranceBp: 300,
};
const card = cardFromLegacy(OLD);
const [dcLine] = card.rateLines;
if (!dcLine) throw new Error('The mapped card has no rate lines.');

describe('cardProblems', () => {
  it('accepts the mapped card', () => {
    expect(cardProblems(card)).toEqual([]);
  });

  it('names duplicate or reserved keys, missing rates and wrong kinds', () => {
    const broken = {
      ...card,
      rateLines: [...card.rateLines, { ...dcLine, label: 'Again' }, { ...dcLine, key: 'panel' }],
      jobItems: [...card.jobItems, { rate: 'gone', per: 'job' as const, qty: 1 }],
      sites: {
        ...card.sites,
        tin_shed: { ...card.sites.tin_shed, crew: [{ rate: 'dc_cable', workers: 2 }] },
      },
      pricing: { mode: 'margin' as const, marginBp: 9_500 },
    };
    expect(
      cardProblems(broken).map((problem) => [problem.path.join('.'), problem.message]),
    ).toEqual([
      ['rateLines.7.key', 'Another rate uses this name.'],
      ['rateLines.8.key', 'Use another short name.'],
      ['jobItems.4.rate', 'Pick a rate that exists.'],
      ['sites.tin_shed.crew.0.rate', 'Pick a rate of the right kind.'],
      ['pricing.marginBp', 'Use a margin below 90%.'],
    ]);
  });

  it('lists where a rate is used, so it is not deleted while in use', () => {
    expect(rateUses(card, 'dc_cable').map((use) => use.site)).toEqual([
      'rcc_elevated',
      'tin_shed',
      'aluminium_rail',
      'ground_mount',
      'custom',
    ]);
    expect(rateUses(card, 'installation')).toEqual([{ where: 'job', site: null }]);
  });

  it('rejects a quotation naming a rate the card no longer has', () => {
    const problems = detailProblems(card, {
      runs: [{ kind: 'dc', cable: 'old_cable', acrossM: 5, upM: 0, runs: 1 }],
    });
    expect(problems[0]?.path).toEqual(['costing', 'runs', 0, 'cable']);
  });
});

describe('survey cable runs', () => {
  it('reads one run per line and writes them back the same way', () => {
    const { runs, unreadable } = parseCableRuns(
      'DC, floor 3: 12 m across, 0 m up, 2 runs\nDC floor 2 — 6 m up, 2 cables\nAC 15m across 9 m down\nwhatever',
    );
    expect(runs).toEqual([
      { kind: 'dc', floor: 3, acrossM: 12, upM: 0, runs: 2 },
      { kind: 'dc', floor: 2, acrossM: 0, upM: 6, runs: 2 },
      { kind: 'ac', floor: null, acrossM: 15, upM: 9, runs: 1 },
    ]);
    expect(unreadable).toEqual(['whatever']);
    expect(formatCableRuns(runs)).toBe(
      'DC · floor 3 · 12 m across · 0 m up · 2 runs\nDC · floor 2 · 0 m across · 6 m up · 2 runs\nAC · 15 m across · 9 m up · 1 run',
    );
    expect(parseCableRuns(formatCableRuns(runs)).runs).toEqual(runs);
  });

  it('sums each kind into the totals the survey form also records', () => {
    const { runs } = parseCableRuns('DC 12 m across 2 runs\nDC 6 m up 2 runs\nAC 24 m across');
    expect(cableTotal(runs, 'dc')).toBe(36);
    expect(cableTotal(runs, 'ac')).toBe(24);
  });
});

describe('installEstimate (contractor rates feed estimates)', () => {
  const rates = [
    {
      id: 'k',
      basis: 'per_kwp' as const,
      taskKey: null,
      projectType: null,
      label: 'Per kWp',
      amountPaise: 3_000_00,
    },
    {
      id: 'd',
      basis: 'per_day' as const,
      taskKey: null,
      projectType: null,
      label: 'Helper day',
      amountPaise: 600_00,
    },
  ];
  const job = {
    rates,
    tasks: [],
    capacityWp: 5_450,
    projectType: 'residential' as const,
    personDays: 4,
  };

  it('uses the contractor’s card: ₹3,000 × 5.45 kWp + ₹600 × 4 days = ₹18,750', () => {
    expect(installEstimate(21_800_00, job)).toEqual({
      amountPaise: 18_750_00,
      source: 'contractor',
    });
  });

  it('keeps the company estimate without a contractor or when its card prices nothing', () => {
    expect(installEstimate(21_800_00, null)).toEqual({ amountPaise: 21_800_00, source: 'company' });
    expect(installEstimate(21_800_00, { ...job, rates: [] })).toEqual({
      amountPaise: 21_800_00,
      source: 'company',
    });
  });
});

describe('travel', () => {
  it('a trip is ₹500 plus ₹10 a km beyond the free 10 km: 40 km costs ₹800', () => {
    expect(tripPaise(card.travel, 40)).toBe(800_00);
    expect(tripPaise(card.travel, 10)).toBe(500_00);
  });
});

describe('roadDistanceKm', () => {
  it('Sangli office to a site in Miraj: about 9 km straight, 12 km by road at 1.3 ×', () => {
    const office = geoPoint(16.8524, 74.5815);
    const site = geoPoint(16.8222, 74.645);
    expect(roadDistanceKm(office, site, 13_000)).toBe(10);
    expect(roadDistanceKm(office, null, 13_000)).toBeNull();
    expect(geoPoint(120, 74)).toBeNull();
  });
});
