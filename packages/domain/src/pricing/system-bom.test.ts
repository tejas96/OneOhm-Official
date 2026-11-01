import { describe, expect, it } from 'vitest';
import type { RateCard } from './rate-card';
import { designSystem } from './system-bom';

const pair = { price: 100_00, cost: 80_00 };
const cable = { baseMeters: 20, perFloorMeters: 5, price: 100_00, cost: 80_00 };
const rates: RateCard = {
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
const product = {
  id: 'x',
  name: 'x',
  unit: 'nos',
  pricePaise: 100_00,
  costPaise: 80_00,
  taxRateBp: 500,
};

const basisOf = (dcCableMeters?: number, acCableMeters?: number) => {
  const design = designSystem({
    targetWp: 3_000,
    panel: { ...product, wattageWp: 500, dcr: true },
    inverter: product,
    site: { floors: 1, structureType: 'rcc_elevated', distanceKm: 0, dcCableMeters, acCableMeters },
    rates,
  });
  const basis = (key: string) => design.lines.find((line) => line.key === key)?.basis;
  return { dc: basis('dc_cable'), ac: basis('ac_cable') };
};

describe('designSystem cable runs', () => {
  it('marks each run measured or estimated on its own', () => {
    expect(basisOf(30)).toEqual({ dc: 'survey', ac: 'default' });
    expect(basisOf(undefined, 12)).toEqual({ dc: 'default', ac: 'survey' });
    expect(basisOf(30, 12)).toEqual({ dc: 'survey', ac: 'survey' });
  });
});
