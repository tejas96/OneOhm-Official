import type { CostingCard, RateLine, SiteSetup } from './costing-card';

// Shared fixtures for the costing engine tests.
export const rupees = (value: number) => value * 100;
export const rate = (
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

export const rail: SiteSetup = {
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

export const card: CostingCard = {
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

export const panel = {
  id: 'pnl',
  name: 'Module',
  unit: 'nos',
  pricePaise: rupees(14_200),
  costPaise: rupees(12_100),
  taxRateBp: 500,
  wattageWp: 545,
  dcr: true,
};
export const inverter = {
  id: 'inv',
  name: 'Inverter 10 kW',
  unit: 'nos',
  pricePaise: rupees(62_000),
  costPaise: rupees(52_000),
  taxRateBp: 500,
};
export const site = { floors: 3, structureType: 'aluminium_rail', distanceKm: 40 } as const;
