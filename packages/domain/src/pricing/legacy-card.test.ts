import { describe, expect, it } from 'vitest';
import { cardFromLegacy, type LegacyRateCard, toCostingCard } from './legacy-card';
import { priceQuote } from './quote-pricing';
import { designSystem } from './system-bom';

const rupees = (value: number) => value * 100;

/** The starter card as it was before the costing card. */
const OLD: LegacyRateCard = {
  structurePerKw: {
    rcc_elevated: { price: rupees(6_000), cost: rupees(4_500) },
    tin_shed: { price: rupees(3_500), cost: rupees(2_600) },
    ground_mount: { price: rupees(9_000), cost: rupees(7_000) },
  },
  dcCable: { baseMeters: 20, perFloorMeters: 6, price: rupees(60), cost: rupees(45) },
  acCable: { baseMeters: 15, perFloorMeters: 4, price: rupees(120), cost: rupees(90) },
  earthingKit: { price: rupees(9_000), cost: rupees(6_500) },
  protectionKit: { price: rupees(7_500), cost: rupees(5_500) },
  installationPerKw: { price: rupees(4_000), cost: rupees(3_000) },
  extraFloorPerKw: { price: rupees(500), cost: rupees(400) },
  freeFloors: 2,
  transport: { baseKm: 25, perKm: rupees(25), flat: rupees(1_500) },
  liaisoning: { price: rupees(6_000), cost: rupees(3_000) },
  goodsTaxBp: 500,
  serviceTaxBp: 1800,
  contingencyBp: 800,
  toleranceBp: 300,
};

const panel = {
  id: 'p',
  name: 'Mono PERC module',
  unit: 'nos',
  pricePaise: rupees(14_200),
  costPaise: rupees(12_100),
  taxRateBp: 500,
  wattageWp: 545,
  dcr: true,
};
const inverter = {
  id: 'i',
  name: 'On-grid inverter 5 kW',
  unit: 'nos',
  pricePaise: rupees(34_000),
  costPaise: rupees(28_000),
  taxRateBp: 500,
};
const battery = {
  id: 'b',
  name: 'Lithium battery 5 kWh',
  unit: 'nos',
  pricePaise: rupees(1_15_000),
  costPaise: rupees(96_000),
  taxRateBp: 1800,
};

type Row = [string, string, string, number, string, number, number, number, string];
const rowsOf = (lines: ReturnType<typeof designSystem>['lines']): Row[] =>
  lines.map((line) => [
    line.key,
    line.description,
    line.category,
    line.quantity,
    line.unit,
    line.unitPricePaise,
    line.unitCostPaise,
    line.taxRateBp,
    line.basis,
  ]);

/** Lines and totals the old engine produced for these inputs, frozen before the change. */
describe('cardFromLegacy prices exactly as the old flat card did', () => {
  it('3 kW on an RCC roof, 1 floor, 10 km: ₹1,93,515', () => {
    const design = designSystem({
      targetWp: 3_000,
      panel,
      inverters: [{ product: inverter, quantity: 1 }],
      site: { floors: 1, structureType: 'rcc_elevated', distanceKm: 10 },
      rates: cardFromLegacy(OLD),
    });
    expect(rowsOf(design.lines)).toEqual([
      [
        'panel',
        'Mono PERC module (545 Wp, DCR)',
        'panel',
        6,
        'nos',
        1420000,
        1210000,
        500,
        'catalog',
      ],
      ['inverter', 'On-grid inverter 5 kW', 'inverter', 1, 'nos', 3400000, 2800000, 500, 'catalog'],
      [
        'structure',
        'Elevated RCC-roof structure (galvanised steel)',
        'structure',
        3.27,
        'kW',
        600000,
        450000,
        500,
        'default',
      ],
      ['dc_cable', 'DC cable (4 sq mm, solar grade)', 'cable', 26, 'm', 6000, 4500, 500, 'default'],
      ['ac_cable', 'AC cable (copper, armoured)', 'cable', 19, 'm', 12000, 9000, 500, 'default'],
      [
        'earthing',
        'Earthing kit (3 pits) and lightning arrester',
        'electrical',
        1,
        'set',
        900000,
        650000,
        500,
        'catalog',
      ],
      [
        'protection',
        'ACDB / DCDB with SPD and MCBs',
        'electrical',
        1,
        'set',
        750000,
        550000,
        500,
        'catalog',
      ],
      [
        'installation',
        'Installation and commissioning',
        'installation',
        3.27,
        'kW',
        400000,
        300000,
        1800,
        'catalog',
      ],
      ['transport', 'Transport to site', 'transport', 1, 'trip', 150000, 150000, 1800, 'default'],
      [
        'liaisoning',
        'DISCOM net-metering application and liaisoning',
        'liaisoning',
        1,
        'job',
        600000,
        300000,
        1800,
        'catalog',
      ],
    ]);
    const priced = priceQuote(design.lines, { contingencyBp: 800, discountPaise: 0 });
    expect(priced.totalPaise).toBe(rupees(1_93_515));
    expect(priced.taxPaise).toBe(rupees(11_778));
    expect(priced.costPaise).toBe(14_450_500);
  });

  it('5 kW on a tin shed, 4 floors, 40 km, ₹5,000 off: ₹2,67,767', () => {
    const design = designSystem({
      targetWp: 5_000,
      panel,
      inverters: [{ product: inverter, quantity: 1 }],
      site: { floors: 4, structureType: 'tin_shed', distanceKm: 40 },
      rates: cardFromLegacy(OLD),
    });
    const keyed = Object.fromEntries(design.lines.map((line) => [line.key, line]));
    expect(design.lines.map((line) => line.key)).toEqual([
      'panel',
      'inverter',
      'structure',
      'dc_cable',
      'ac_cable',
      'earthing',
      'protection',
      'installation',
      'extra_floor',
      'transport',
      'liaisoning',
    ]);
    expect(keyed.extra_floor).toMatchObject({
      description: 'Extra effort above floor 2',
      quantity: 10.9,
      unit: 'kW·floor',
    });
    // ₹1,500 flat + 15 km beyond the free 25 km at ₹25.
    expect(keyed.transport?.unitPricePaise).toBe(rupees(1_875));
    expect(keyed.dc_cable?.quantity).toBe(44);
    const priced = priceQuote(design.lines, { contingencyBp: 800, discountPaise: rupees(5_000) });
    expect(priced).toMatchObject({
      subtotalPaise: 25_306_000,
      contingencyPaise: 262_100,
      taxPaise: 1_708_600,
      totalPaise: 26_776_700,
      costPaise: 20_552_500,
    });
  });

  it('10 kW ground mount with battery and measured cables: ₹6,27,209', () => {
    const design = designSystem({
      targetWp: 10_000,
      panel,
      inverters: [{ product: inverter, quantity: 1 }],
      battery,
      site: {
        floors: 0,
        structureType: 'ground_mount',
        distanceKm: 26,
        dcCableMeters: 42.5,
        acCableMeters: 18,
      },
      rates: cardFromLegacy(OLD),
    });
    const keyed = Object.fromEntries(design.lines.map((line) => [line.key, line]));
    expect(keyed.structure).toMatchObject({
      quantity: 10.36,
      description: 'Ground-mount structure with foundations',
    });
    expect(keyed.dc_cable).toMatchObject({ quantity: 42.5, basis: 'survey' });
    expect(keyed.ac_cable).toMatchObject({ quantity: 18, basis: 'survey' });
    const priced = priceQuote(design.lines, { contingencyBp: 800, discountPaise: 1_234_500 });
    expect(priced).toMatchObject({
      subtotalPaise: 58_221_500,
      contingencyPaise: 758_100,
      taxPaise: 4_975_800,
      totalPaise: 62_720_900,
      costPaise: 47_755_750,
    });
  });
});

describe('toCostingCard', () => {
  it('reads old snapshots through the mapping and today’s cards as they are', () => {
    const card = cardFromLegacy(OLD);
    expect(toCostingCard(OLD)).toEqual(card);
    expect(toCostingCard(card)).toBe(card);
    expect(() => toCostingCard({ rates: 1 })).toThrow();
  });

  it('adds the new site types without charging anything new', () => {
    const card = cardFromLegacy(OLD);
    expect(card.sites.aluminium_rail.perKw.pricePaise).toBe(rupees(3_500));
    expect(card.sites.custom.perKw.pricePaise).toBe(rupees(6_000));
    expect(card).toMatchObject({ wastageBp: 0, overheadBp: 0, pricing: { mode: 'rates' } });
    expect(card.travel.visits).toBe(1);
  });
});
