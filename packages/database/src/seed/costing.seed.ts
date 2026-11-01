import type { CostingCard, RateLine, StructurePart } from '@oneohm/domain';

const rupees = (value: number) => value * 100;

const rate = (
  key: string,
  label: string,
  kind: RateLine['kind'],
  unit: string,
  price: number,
  cost: number,
): RateLine => ({
  key,
  label,
  kind,
  unit,
  pricePaise: rupees(price),
  costPaise: rupees(cost),
  tax: kind === 'labour' || kind === 'equipment' || kind === 'service' ? 'service' : 'goods',
  productId: null,
});

/**
 * STARTER VALUES. Rate lines for building real BOMs (PRD 3.9): cable sizes, routing,
 * structure parts, crew and equipment. None is charged on any site until it is added in
 * Settings → Rates, except the aluminium-rail parts below; replace them with OneOhm's rates.
 */
export const STARTER_EXTRA_RATES: readonly RateLine[] = [
  rate('dc_cable_6', 'DC cable (6 sq mm, solar grade)', 'cable', 'm', 85, 65),
  rate('ac_cable_4c6', 'AC cable (4 core, 6 sq mm, armoured)', 'cable', 'm', 240, 185),
  rate('earth_strip', 'Earthing strip (GI, 25 × 3 mm)', 'cable', 'm', 160, 120),
  rate('conduit', 'PVC conduit (25 mm) with bends', 'routing', 'm', 35, 25),
  rate('cable_tray', 'Cable tray (perforated GI)', 'routing', 'm', 220, 170),
  rate('cable_clips', 'Clipped on wall (clips and saddles)', 'routing', 'm', 12, 8),
  rate('al_rail', 'Aluminium rail', 'structure', 'm', 380, 300),
  rate('rail_splice', 'Rail splice', 'structure', 'nos', 90, 65),
  rate('mid_clamp', 'Mid clamp', 'structure', 'nos', 45, 32),
  rate('end_clamp', 'End clamp', 'structure', 'nos', 45, 32),
  rate('roof_foot', 'Roof foot (L-foot) with anchor', 'structure', 'nos', 120, 90),
  rate('fastener_set', 'SS fastener set', 'structure', 'set', 60, 40),
  rate('gi_leg', 'GI leg (per metre of height)', 'structure', 'm', 450, 350),
  rate('foundation', 'Concrete foundation block', 'structure', 'nos', 1_200, 900),
  rate('fabrication', 'Structure fabrication', 'labour', 'kW', 1_500, 1_100),
  rate('installer_day', 'Skilled installer', 'labour', 'day', 1_200, 900),
  rate('helper_day', 'Helper', 'labour', 'day', 700, 550),
  rate('scaffolding', 'Scaffolding hire', 'equipment', 'day', 1_500, 1_200),
  rate('lifting', 'Lifting (chain pulley or crane)', 'equipment', 'job', 2_500, 2_000),
];

/** STARTER VALUES. Rails, clamps, feet and fasteners for panels in rows on a flat roof. */
export const STARTER_RAIL_PARTS: readonly StructurePart[] = [
  { rate: 'al_rail', per: 'panel', qty: 2.3 },
  { rate: 'rail_splice', per: 'row', qty: 2 },
  { rate: 'mid_clamp', per: 'gap', qty: 2 },
  { rate: 'end_clamp', per: 'row', qty: 4 },
  { rate: 'roof_foot', per: 'panel', qty: 2 },
  { rate: 'fastener_set', per: 'panel', qty: 1 },
];

/**
 * The starter rate lines a card does not have yet, and the aluminium-rail parts when that
 * site type has none. Nothing already on the card changes, so its prices stay the same.
 */
export function withStarterBom(card: CostingCard): CostingCard {
  const missing = STARTER_EXTRA_RATES.filter(
    (extra) => !card.rateLines.some((line) => line.key === extra.key),
  );
  const rail = card.sites.aluminium_rail;
  return {
    ...card,
    rateLines: [...card.rateLines, ...missing],
    sites: {
      ...card.sites,
      aluminium_rail: rail.parts.length > 0 ? rail : { ...rail, parts: STARTER_RAIL_PARTS },
    },
  };
}
