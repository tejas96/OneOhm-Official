import type { SiteSetup, StructurePart } from './costing-card';
import { type CostingDetail, countOf, type RateNeed, type UsedDetail } from './costing-detail';
import type { QuantityBasis } from './quote-pricing';

export interface StructureInput {
  readonly site: SiteSetup;
  readonly panels: number;
  readonly kw: number;
  readonly detail?: CostingDetail['structure'];
}

export interface StructureEstimate {
  readonly used: UsedDetail['structure'];
  /** One need per part, when the structure has parts. */
  readonly needs: readonly RateNeed[];
  /** The per-kW benchmark line, when it has none. */
  readonly perKw: {
    readonly quantity: number;
    readonly pricePaise: number;
    readonly costPaise: number;
    readonly basis: QuantityBasis;
  } | null;
}

/**
 * The mounting structure (PRD 3.9 C) from its actual parts: rails, legs, clamps,
 * fasteners and foundations, counted per panel, per row, per gap between panels, per kW
 * or per job, with legs growing with the height. Panels sit in rows of `panelsPerRow`,
 * so 18 panels in rows of 6 make 3 rows and 15 gaps. A structure without parts falls back
 * to its per-kW benchmark. Anything the quotation sets counts as measured.
 */
export function structureEstimate(input: StructureInput): StructureEstimate {
  const { site, panels, kw, detail } = input;
  const basis: QuantityBasis = detail ? 'survey' : 'default';
  const heightM = detail?.heightM ?? site.heightM;
  const panelsPerRow = Math.max(1, Math.round(detail?.panelsPerRow ?? site.panelsPerRow));
  const rows = Math.max(1, Math.ceil(panels / panelsPerRow));
  const parts: readonly StructurePart[] = detail?.parts ?? site.parts;
  const used = {
    heightM,
    tiltDeg: detail?.tiltDeg ?? site.tiltDeg,
    panelsPerRow,
    rows,
    parts,
    perKw: parts.length === 0,
  };
  if (parts.length === 0) {
    return {
      used,
      needs: [],
      perKw: {
        quantity: kw,
        pricePaise: site.perKw.pricePaise,
        costPaise: site.perKw.costPaise,
        basis,
      },
    };
  }
  const size = { kw, panels, rows };
  const needs = parts.map((part) => ({
    rate: part.rate,
    quantity: part.qty * countOf(part.per, size) * (part.perHeightM ? heightM : 1),
    basis,
  }));
  return { used, needs, perKw: null };
}
