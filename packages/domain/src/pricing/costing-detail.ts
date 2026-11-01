import type {
  AccessLevel,
  CableRouteKind,
  CrewMember,
  QuantityPer,
  StructurePart,
} from './costing-card';
import type { QuantityBasis } from './quote-pricing';

/**
 * A cable run as measured on site (PRD 3.4 floor-wise and route-wise): metres across and
 * up, and how many cables share the route. Without a cable or routing, the site type's
 * default for that kind of route applies; routing `null` means none.
 */
export interface CableRunInput {
  readonly kind: CableRouteKind;
  readonly cable?: string | undefined;
  readonly routing?: string | null | undefined;
  readonly floor?: number | null | undefined;
  readonly acrossM: number;
  readonly upM: number;
  readonly runs: number;
}

/** Hired equipment on one quotation. */
export interface EquipmentInput {
  readonly rate: string;
  readonly qty: number;
}

/**
 * What a quotation says beyond the quick-quote inputs. Every part is optional: whatever
 * is left out comes from the site type's defaults, and whatever is given counts as
 * measured (no contingency).
 */
export interface CostingDetail {
  readonly inverterLocation?: string | undefined;
  readonly arrayLocation?: string | undefined;
  readonly runs?: readonly CableRunInput[] | undefined;
  readonly structure?:
    | {
        readonly heightM?: number | undefined;
        readonly tiltDeg?: number | undefined;
        readonly panelsPerRow?: number | undefined;
        readonly parts?: readonly StructurePart[] | undefined;
      }
    | undefined;
  readonly crew?: readonly CrewMember[] | undefined;
  readonly days?: number | undefined;
  readonly visits?: number | undefined;
  readonly access?: AccessLevel | undefined;
  readonly equipment?: readonly EquipmentInput[] | undefined;
}

/** A cable run as priced: its cable and routing settled, its metres worked out. */
export interface PricedRun {
  readonly kind: CableRouteKind;
  readonly cable: string;
  readonly routing: string | null;
  readonly floor: number | null;
  readonly acrossM: number;
  readonly upM: number;
  readonly runs: number;
  /** Cable bought for the run, wastage included. */
  readonly cableM: number;
  /** Route length, wastage included: what the conduit or tray covers. */
  readonly routeM: number;
  readonly basis: QuantityBasis;
}

/** What the engine actually used, so a manager can see and change any of it. */
export interface UsedDetail {
  readonly runs: readonly PricedRun[];
  readonly structure: {
    readonly heightM: number;
    readonly tiltDeg: number;
    readonly panelsPerRow: number;
    readonly rows: number;
    readonly parts: readonly StructurePart[];
    /** True when the structure is priced per kW because it has no parts. */
    readonly perKw: boolean;
  };
  readonly crew: readonly CrewMember[];
  readonly days: number;
  readonly visits: number;
  readonly access: AccessLevel;
  readonly equipment: readonly EquipmentInput[];
  readonly tripPaise: number;
}

/** A quantity of a rate line the engine needs, before lines are merged per rate. */
export interface RateNeed {
  readonly rate: string;
  readonly quantity: number;
  readonly basis: QuantityBasis;
}

/** How many of a thing an item counts, for a system of this size and layout. */
export function countOf(
  per: QuantityPer,
  size: { readonly kw: number; readonly panels: number; readonly rows: number },
): number {
  if (per === 'kw') return size.kw;
  if (per === 'panel') return size.panels;
  if (per === 'row') return size.rows;
  if (per === 'gap') return Math.max(0, size.panels - size.rows);
  return 1;
}

export const round2 = (value: number): number => Math.round(value * 100) / 100;
