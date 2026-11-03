import type { SubsidyCategory } from '../subsidy/subsidy-rules';

/** The few fields of a panel product the suggestion needs. */
export interface PanelLike {
  readonly id: string;
  readonly active: boolean;
  readonly dcr: boolean;
  readonly pricePaise: number;
}

/**
 * The panel to start a quotation with: the cheapest active DCR panel where a subsidy is
 * possible (it needs DCR), otherwise the cheapest active non-DCR panel. When no panel is
 * of the wanted kind, the cheapest active panel; null when none is active.
 */
export function suggestPanel<T extends PanelLike>(
  panels: readonly T[],
  category: SubsidyCategory,
): T | null {
  const active = panels.filter((product) => product.active);
  const wantDcr = category !== 'commercial';
  const preferred = active.filter((product) => product.dcr === wantDcr);
  const pool = preferred.length > 0 ? preferred : active;
  return [...pool].sort((left, right) => left.pricePaise - right.pricePaise)[0] ?? null;
}
