import type { CostingCard, StructureType } from './costing-card';

export type { StructureType } from './costing-card';

/** A catalog product as the price engine needs it. */
export interface PricedProduct {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly pricePaise: number;
  readonly costPaise: number;
  readonly taxRateBp: number;
}

export interface PanelProduct extends PricedProduct {
  readonly wattageWp: number;
  readonly dcr: boolean;
}

/** Configurable rates and site-type defaults (Settings → Rates): the costing card. */
export type RateCard = CostingCard;

export interface SiteFacts {
  readonly floors: number;
  readonly structureType: StructureType;
  readonly distanceKm: number;
  /** Survey measurements replace defaults when present. */
  readonly dcCableMeters?: number | undefined;
  readonly acCableMeters?: number | undefined;
}
