import type { Product } from '@oneohm/api-contracts';
import {
  type InverterPick,
  inverterPicks,
  MAX_INVERTER_MODELS,
  MAX_INVERTERS_PER_MODEL,
  suggestInverterMix,
} from '@oneohm/domain';

/** One inverter row as typed: a model (or none yet) and how many. */
export interface InverterRow {
  readonly productId: string | null;
  readonly quantity: string;
}

export const EMPTY_INVERTER_ROW: InverterRow = { productId: null, quantity: '1' };
export { MAX_INVERTER_MODELS };

/** Rows from saved picks; an older quotation with one inverter gives one row. */
export function rowsFromInput(input: {
  readonly inverters?: readonly InverterPick[] | null | undefined;
  readonly inverterProductId?: string | null | undefined;
}): InverterRow[] {
  return inverterPicks(input).map((pick) => ({
    productId: pick.productId,
    quantity: String(pick.quantity),
  }));
}

const count = (text: string): number | null => {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= MAX_INVERTERS_PER_MODEL ? value : null;
};

/**
 * The picks for the API, or null while a row has no model or a count that is not a whole
 * number from 1 to 50. The same model on two rows counts once.
 */
export function picksFromRows(rows: readonly InverterRow[]): InverterPick[] | null {
  if (rows.length === 0 || rows.length > MAX_INVERTER_MODELS) return null;
  const picks: InverterPick[] = [];
  for (const row of rows) {
    const quantity = count(row.quantity);
    if (!row.productId || quantity === null) return null;
    picks.push({ productId: row.productId, quantity });
  }
  return inverterPicks({ inverters: picks });
}

/** Same models and counts, in the same order. */
export const sameRows = (left: readonly InverterRow[], right: readonly InverterRow[]) =>
  left.length === right.length &&
  left.every(
    (row, index) =>
      row.productId === right[index]?.productId && row.quantity === right[index]?.quantity,
  );

const isHybrid = (product: Product) => /hybrid|hyb/i.test(`${product.sku} ${product.name}`);

/**
 * The inverters suggested for a size: the smallest single model that carries the array
 * (DC up to 110% of AC), else the largest model as many times as fill it plus one
 * smaller for the rest. Battery systems
 * prefer hybrid inverters, grid-only systems the others; then the cheapest.
 */
export function suggestInverters(
  inverters: readonly Product[],
  targetWp: number,
  systemType: 'on_grid' | 'hybrid' | 'off_grid',
): InverterRow[] {
  const wantHybrid = systemType !== 'on_grid';
  const sized = [...inverters]
    .filter((product) => product.active && product.ratedW)
    .sort(
      (left, right) =>
        (left.ratedW ?? 0) - (right.ratedW ?? 0) ||
        Number(isHybrid(left) !== wantHybrid) - Number(isHybrid(right) !== wantHybrid) ||
        left.pricePaise - right.pricePaise,
    );
  return suggestInverterMix(
    sized.map((product) => ({ id: product.id, ratedW: product.ratedW ?? 0 })),
    targetWp,
  ).map((pick) => ({ productId: pick.productId, quantity: String(pick.quantity) }));
}

/** Total AC rating of the rows that are complete, in watts. */
export function rowsTotalW(rows: readonly InverterRow[], catalog: readonly Product[]): number {
  return rows.reduce((sum, row) => {
    const product = catalog.find((entry) => entry.id === row.productId);
    const quantity = count(row.quantity) ?? 0;
    return sum + (product?.ratedW ?? 0) * quantity;
  }, 0);
}

/** The panels' DC size for a typed size, rounded up to whole panels; 0 until both are known. */
export function dcCapacityWp(targetKw: string, panel: Product | undefined): number {
  const wattage = panel?.wattageWp;
  const target = Number(targetKw) * 1000;
  if (!wattage || !Number.isFinite(target) || target <= 0) return 0;
  return Math.ceil(target / wattage) * wattage;
}
