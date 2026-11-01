import type { LineCategory } from './quote-pricing';

/**
 * The costing card (PRD 3.9): every rate the engine prices with, the defaults for each
 * kind of site, and the rules that turn cost into price. Saved as one document so a
 * quotation can snapshot exactly what it was priced with. Amounts are paise, shares are
 * basis points (100 = 1%), lengths are metres.
 */

/** Kinds of site, named after the mounting structure they need. */
export const STRUCTURE_TYPES = [
  'rcc_elevated',
  'tin_shed',
  'aluminium_rail',
  'ground_mount',
  'custom',
] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

/** What a rate line prices; decides where it sits on the quotation and in the cost. */
export const RATE_KINDS = [
  'structure',
  'cable',
  'routing',
  'electrical',
  'labour',
  'equipment',
  'service',
  'other',
] as const;
export type RateKind = (typeof RATE_KINDS)[number];

/** The quotation group each kind of rate line lands in. */
export const KIND_CATEGORY: Readonly<Record<RateKind, LineCategory>> = {
  structure: 'structure',
  cable: 'cable',
  routing: 'cable',
  electrical: 'electrical',
  labour: 'installation',
  equipment: 'installation',
  service: 'liaisoning',
  other: 'other',
};

/** Kinds that are stock the store can hold, so a rate line may name its catalog product. */
export const MATERIAL_KINDS: readonly RateKind[] = ['structure', 'cable', 'routing', 'electrical'];

/** What a quantity counts: once per job, per kW, per panel, per row, or per gap in a row. */
export const QUANTITY_PER = ['job', 'kw', 'panel', 'row', 'gap'] as const;
export type QuantityPer = (typeof QUANTITY_PER)[number];

/** Cable routes by what they carry. */
export const CABLE_ROUTES = ['dc', 'ac', 'earth'] as const;
export type CableRouteKind = (typeof CABLE_ROUTES)[number];

/** How easy the site is to work on; harder sites add labour. */
export const ACCESS_LEVELS = ['easy', 'moderate', 'difficult'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Price each line as set on its rate, or as cost plus overhead plus a target margin. */
export const PRICING_MODES = ['rates', 'margin'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

/** One priced thing: a cable size, a rail, an installer's day, a permit. */
export interface RateLine {
  /** Stable id, lower case with underscores; quotation lines carry it as their key. */
  readonly key: string;
  readonly label: string;
  readonly kind: RateKind;
  readonly unit: string;
  readonly pricePaise: number;
  readonly costPaise: number;
  readonly tax: 'goods' | 'service';
  /** The catalog product it is, when it is stock; its catalog price and cost then apply. */
  readonly productId: string | null;
  /** Set when a linked product's own GST applies instead of the goods or service rate. */
  readonly taxRateBp?: number | undefined;
}

/** A quantity of one rate line, counted per job, kW, panel, row or gap. */
export interface RateItem {
  readonly rate: string;
  readonly per: QuantityPer;
  readonly qty: number;
}

/** A structure part; legs and posts can grow with the structure's height. */
export interface StructurePart extends RateItem {
  readonly perHeightM?: boolean | undefined;
}

/** A default cable route: across the roof, then down each floor, with its run count. */
export interface CableRoute {
  readonly kind: CableRouteKind;
  readonly cable: string;
  /** Conduit, tray or clips, priced per metre of route; null leaves it out. */
  readonly routing: string | null;
  readonly acrossM: number;
  readonly upPerFloorM: number;
  readonly runs: number;
}

export interface CrewMember {
  /** A labour rate line, priced per person-day. */
  readonly rate: string;
  readonly workers: number;
}

/** Hired equipment, needed from a floor up (0 means always). */
export interface EquipmentRule {
  readonly rate: string;
  readonly qty: number;
  readonly fromFloor: number;
}

/** Everything a quick quote assumes about one kind of site until the survey says more. */
export interface SiteSetup {
  /** Names the structure line when no parts are listed. */
  readonly label: string;
  /** Benchmark per kW, used only when the structure has no parts. */
  readonly perKw: { readonly pricePaise: number; readonly costPaise: number };
  readonly heightM: number;
  readonly tiltDeg: number;
  readonly panelsPerRow: number;
  readonly parts: readonly StructurePart[];
  readonly routes: readonly CableRoute[];
  readonly crew: readonly CrewMember[];
  /** How many kW the crew installs in a day; 0 means the minimum days always. */
  readonly kwPerDay: number;
  readonly minDays: number;
  readonly equipment: readonly EquipmentRule[];
}

export interface TravelSetup {
  readonly label: string;
  readonly flatPaise: number;
  /** Kilometres included in the flat charge. */
  readonly baseKm: number;
  readonly perKmPaise: number;
  /** Road distance as a share of the straight line from base (13_000 = 1.3 ×). */
  readonly roadFactorBp: number;
  /** Site visits a job needs by default; each is one trip, charged once. */
  readonly visits: number;
}

export interface CostingCard {
  readonly version: 2;
  readonly rateLines: readonly RateLine[];
  readonly sites: Readonly<Record<StructureType, SiteSetup>>;
  /** On every job: kits, per-kW installation, the DISCOM work. */
  readonly jobItems: readonly RateItem[];
  /** Extra labour per kW for each floor above `freeFloors`. */
  readonly extraFloor: { readonly rate: string | null; readonly freeFloors: number };
  readonly travel: TravelSetup;
  /** Extra labour for harder sites. */
  readonly accessBp: Readonly<Record<AccessLevel, number>>;
  /** Cable cut and loop allowance on every route. */
  readonly wastageBp: number;
  /** Office and running costs, on top of the direct cost. */
  readonly overheadBp: number;
  readonly pricing: { readonly mode: PricingMode; readonly marginBp: number };
  readonly goodsTaxBp: number;
  readonly serviceTaxBp: number;
  readonly contingencyBp: number;
  readonly toleranceBp: number;
  /** Discounts above this share of the price need approval; unset uses the server default. */
  readonly discountApprovalBp?: number | undefined;
  /** Shadow-free m² a rooftop needs per kWp, checked after the survey; 0 switches it off. */
  readonly sqmPerKwp?: number | undefined;
}

export const rateLineOf = (card: CostingCard, key: string): RateLine | undefined =>
  card.rateLines.find((line) => line.key === key);

/** The GST a rate line carries on a quotation. */
export function taxOf(card: CostingCard, line: RateLine): number {
  if (line.taxRateBp !== undefined) return line.taxRateBp;
  return line.tax === 'service' ? card.serviceTaxBp : card.goodsTaxBp;
}

/**
 * The card with each linked product's catalog price, cost and GST in its rate line: a
 * product has one price wherever it is sold. Quotations snapshot the result.
 */
export function withCatalogPrices(
  card: CostingCard,
  products: readonly {
    readonly id: string;
    readonly pricePaise: number;
    readonly costPaise: number;
    readonly taxRateBp: number;
  }[],
): CostingCard {
  return {
    ...card,
    rateLines: card.rateLines.map((line) => {
      const product = line.productId
        ? products.find((entry) => entry.id === line.productId)
        : undefined;
      return product
        ? {
            ...line,
            pricePaise: product.pricePaise,
            costPaise: product.costPaise,
            taxRateBp: product.taxRateBp,
          }
        : line;
    }),
  };
}
