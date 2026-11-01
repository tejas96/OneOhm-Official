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

export type StructureType = 'rcc_elevated' | 'tin_shed' | 'ground_mount';

/** Configurable rates and site-type defaults (Settings → Rate cards). */
export interface RateCard {
  readonly structurePerKw: Readonly<Record<StructureType, { price: number; cost: number }>>;
  readonly dcCable: {
    readonly baseMeters: number;
    readonly perFloorMeters: number;
    readonly price: number;
    readonly cost: number;
  };
  readonly acCable: {
    readonly baseMeters: number;
    readonly perFloorMeters: number;
    readonly price: number;
    readonly cost: number;
  };
  readonly earthingKit: { readonly price: number; readonly cost: number };
  readonly protectionKit: { readonly price: number; readonly cost: number };
  readonly installationPerKw: { readonly price: number; readonly cost: number };
  readonly extraFloorPerKw: { readonly price: number; readonly cost: number };
  readonly freeFloors: number;
  readonly transport: { readonly baseKm: number; readonly perKm: number; readonly flat: number };
  readonly liaisoning: { readonly price: number; readonly cost: number };
  readonly goodsTaxBp: number;
  readonly serviceTaxBp: number;
  readonly contingencyBp: number;
  readonly toleranceBp: number;
}

export interface SiteFacts {
  readonly floors: number;
  readonly structureType: StructureType;
  readonly distanceKm: number;
  /** Survey measurements replace defaults when present. */
  readonly dcCableMeters?: number | undefined;
  readonly acCableMeters?: number | undefined;
}
