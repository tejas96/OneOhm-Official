import type { StockMovement, StockRow } from '@oneohm/api-contracts';
import { LINE_CATEGORIES } from '@oneohm/domain';
import { matchesSearch } from '@/lib/use-search-param';

/** Which products the stock table shows (`?show=`). */
export const STOCK_SHOWS = ['all', 'low', 'inStock'] as const;
export type StockShow = (typeof STOCK_SHOWS)[number];

/** The category filter (`?category=`): every category, or one. */
export const STOCK_CATEGORIES = ['all', ...LINE_CATEGORIES] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];

/** The most ledger rows the API sends back at once (stock.service.ts `movements`). */
export const MOVEMENTS_LIMIT = 200;

export interface StockFilters {
  readonly search: string;
  readonly show: StockShow;
  readonly category: StockCategory;
}

/** Stock rows that match the search (name, SKU, brand, category) and the filters. */
export function filterStock(
  rows: readonly StockRow[],
  filters: StockFilters,
  categoryLabel: (category: StockRow['category']) => string = (category) => category,
): StockRow[] {
  return rows.filter(
    (row) =>
      (filters.show !== 'low' || row.low) &&
      (filters.show !== 'inStock' || row.onHand > 0) &&
      (filters.category === 'all' || row.category === filters.category) &&
      matchesSearch(filters.search, [row.name, row.sku, row.brand, categoryLabel(row.category)]),
  );
}

/** A ledger row matching the search: product, project, place, note or who. */
export function matchesMovement(search: string, movement: StockMovement, kindLabel = ''): boolean {
  return matchesSearch(search, [
    movement.productName,
    movement.projectCode,
    movement.locationName,
    movement.note,
    movement.by,
    kindLabel,
  ]);
}
