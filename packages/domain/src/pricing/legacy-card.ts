import type { CostingCard, RateLine, SiteSetup, StructureType } from './costing-card';

/** A price and cost pair, in paise. */
interface Pair {
  readonly price: number;
  readonly cost: number;
}

/**
 * The flat per-kW rate card used before the costing card (until November 2026). Accepted
 * quotations snapshotted it; they are read through `cardFromLegacy` and price the same.
 */
export interface LegacyRateCard {
  readonly structurePerKw: Readonly<Record<'rcc_elevated' | 'tin_shed' | 'ground_mount', Pair>>;
  readonly dcCable: Pair & { readonly baseMeters: number; readonly perFloorMeters: number };
  readonly acCable: Pair & { readonly baseMeters: number; readonly perFloorMeters: number };
  readonly earthingKit: Pair;
  readonly protectionKit: Pair;
  readonly installationPerKw: Pair;
  readonly extraFloorPerKw: Pair;
  readonly freeFloors: number;
  readonly transport: { readonly baseKm: number; readonly perKm: number; readonly flat: number };
  readonly liaisoning: Pair;
  readonly goodsTaxBp: number;
  readonly serviceTaxBp: number;
  readonly contingencyBp: number;
  readonly toleranceBp: number;
  readonly discountApprovalBp?: number | undefined;
  readonly sqmPerKwp?: number | undefined;
}

/** Road distance is usually about this much longer than the straight line. */
export const DEFAULT_ROAD_FACTOR_BP = 13_000;

/** The names the old engine printed for each structure. */
const STRUCTURE_LABELS: Readonly<Record<StructureType, string>> = {
  rcc_elevated: 'Elevated RCC-roof structure (galvanised steel)',
  tin_shed: 'Mounting structure on tin shed (aluminium rail)',
  aluminium_rail: 'Aluminium rail structure on RCC roof',
  ground_mount: 'Ground-mount structure with foundations',
  custom: 'Custom structure designed for the site',
};

/** Height and tilt each kind of site starts from; the survey or a manager can change them. */
const LAYOUT: Readonly<Record<StructureType, Pick<SiteSetup, 'heightM' | 'tiltDeg'>>> = {
  rcc_elevated: { heightM: 1.5, tiltDeg: 15 },
  tin_shed: { heightM: 0.3, tiltDeg: 0 },
  aluminium_rail: { heightM: 0.5, tiltDeg: 15 },
  ground_mount: { heightM: 1, tiltDeg: 15 },
  custom: { heightM: 1.5, tiltDeg: 15 },
};

const rate = (
  key: string,
  label: string,
  kind: RateLine['kind'],
  unit: string,
  pair: Pair,
  tax: RateLine['tax'],
): RateLine => ({
  key,
  label,
  kind,
  unit,
  pricePaise: pair.price,
  costPaise: pair.cost,
  tax,
  productId: null,
});

/**
 * The old card as a costing card that prices every quotation exactly as before: the same
 * lines, keys, descriptions, quantities, rates and order. Structures have no parts (so
 * they stay per kW), routes are one cable each with no routing or wastage, and labour is
 * the per-kW installation line; nothing new is charged.
 */
export function cardFromLegacy(old: LegacyRateCard): CostingCard {
  const perKw: Readonly<Record<StructureType, Pair>> = {
    ...old.structurePerKw,
    aluminium_rail: old.structurePerKw.tin_shed,
    custom: old.structurePerKw.rcc_elevated,
  };
  const site = (type: StructureType): SiteSetup => ({
    label: STRUCTURE_LABELS[type],
    perKw: { pricePaise: perKw[type].price, costPaise: perKw[type].cost },
    ...LAYOUT[type],
    panelsPerRow: 6,
    parts: [],
    routes: [
      {
        kind: 'dc',
        cable: 'dc_cable',
        routing: null,
        acrossM: old.dcCable.baseMeters,
        upPerFloorM: old.dcCable.perFloorMeters,
        runs: 1,
      },
      {
        kind: 'ac',
        cable: 'ac_cable',
        routing: null,
        acrossM: old.acCable.baseMeters,
        upPerFloorM: old.acCable.perFloorMeters,
        runs: 1,
      },
    ],
    crew: [],
    kwPerDay: 0,
    minDays: 1,
    equipment: [],
  });
  return {
    version: 2,
    rateLines: [
      rate('dc_cable', 'DC cable (4 sq mm, solar grade)', 'cable', 'm', old.dcCable, 'goods'),
      rate('ac_cable', 'AC cable (copper, armoured)', 'cable', 'm', old.acCable, 'goods'),
      rate(
        'earthing',
        'Earthing kit (3 pits) and lightning arrester',
        'electrical',
        'set',
        old.earthingKit,
        'goods',
      ),
      rate(
        'protection',
        'ACDB / DCDB with SPD and MCBs',
        'electrical',
        'set',
        old.protectionKit,
        'goods',
      ),
      rate(
        'installation',
        'Installation and commissioning',
        'labour',
        'kW',
        old.installationPerKw,
        'service',
      ),
      rate('extra_floor', 'Extra effort', 'labour', 'kW·floor', old.extraFloorPerKw, 'service'),
      rate(
        'liaisoning',
        'DISCOM net-metering application and liaisoning',
        'service',
        'job',
        old.liaisoning,
        'service',
      ),
    ],
    sites: {
      rcc_elevated: site('rcc_elevated'),
      tin_shed: site('tin_shed'),
      aluminium_rail: site('aluminium_rail'),
      ground_mount: site('ground_mount'),
      custom: site('custom'),
    },
    jobItems: [
      { rate: 'earthing', per: 'job', qty: 1 },
      { rate: 'protection', per: 'job', qty: 1 },
      { rate: 'installation', per: 'kw', qty: 1 },
      { rate: 'liaisoning', per: 'job', qty: 1 },
    ],
    extraFloor: { rate: 'extra_floor', freeFloors: old.freeFloors },
    travel: {
      label: 'Transport to site',
      flatPaise: old.transport.flat,
      baseKm: old.transport.baseKm,
      perKmPaise: old.transport.perKm,
      roadFactorBp: DEFAULT_ROAD_FACTOR_BP,
      visits: 1,
    },
    accessBp: { easy: 0, moderate: 1500, difficult: 3000 },
    wastageBp: 0,
    overheadBp: 0,
    pricing: { mode: 'rates', marginBp: 2000 },
    goodsTaxBp: old.goodsTaxBp,
    serviceTaxBp: old.serviceTaxBp,
    contingencyBp: old.contingencyBp,
    toleranceBp: old.toleranceBp,
    ...(old.discountApprovalBp === undefined ? {} : { discountApprovalBp: old.discountApprovalBp }),
    ...(old.sqmPerKwp === undefined ? {} : { sqmPerKwp: old.sqmPerKwp }),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Whatever a rate card row or a quotation snapshot holds, as a costing card: today's
 * cards as they are, the old flat card through `cardFromLegacy`.
 */
export function toCostingCard(raw: unknown): CostingCard {
  if (isRecord(raw) && raw.version === 2) return raw as unknown as CostingCard;
  if (isRecord(raw) && isRecord(raw.structurePerKw)) {
    return cardFromLegacy(raw as unknown as LegacyRateCard);
  }
  throw new Error('This rate card is in a shape the price engine does not know.');
}
