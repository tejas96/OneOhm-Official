import type { Vendor, VendorScorecard } from '@oneohm/api-contracts';

export const SHOW_FILTERS = ['active', 'owed', 'overdue', 'late', 'advances', 'all'] as const;
export type ShowFilter = (typeof SHOW_FILTERS)[number];
export const SORTS = ['name', 'outstanding', 'ordered', 'onTime'] as const;
export type VendorSort = (typeof SORTS)[number];

export interface VendorRow {
  readonly vendor: Vendor;
  readonly card: VendorScorecard | null;
}

const pick = <T extends string>(values: readonly T[], raw: string | null, fallback: T): T =>
  values.find((value) => value === raw) ?? fallback;

export function readVendorFilters(params: URLSearchParams) {
  return {
    show: pick(SHOW_FILTERS, params.get('show'), 'active'),
    sort: pick(SORTS, params.get('sort'), 'name'),
    search: params.get('q') ?? '',
  };
}
export type VendorFilters = ReturnType<typeof readVendorFilters>;

function shown(row: VendorRow, show: ShowFilter): boolean {
  const card = row.card;
  if (show === 'all') return true;
  if (show === 'active') return row.vendor.active;
  if (!card) return false;
  if (show === 'owed') return card.outstandingPaise > 0;
  if (show === 'overdue') return card.overduePaise > 0;
  if (show === 'late') return card.late + card.openLate > 0;
  return card.openAdvancesPaise > 0;
}

const SORTERS: Readonly<Record<VendorSort, (a: VendorRow, b: VendorRow) => number>> = {
  name: (a, b) => a.vendor.name.localeCompare(b.vendor.name),
  outstanding: (a, b) => (b.card?.outstandingPaise ?? 0) - (a.card?.outstandingPaise ?? 0),
  ordered: (a, b) => (b.card?.orderedPaise ?? 0) - (a.card?.orderedPaise ?? 0),
  // Worst first; vendors with no record yet go last.
  onTime: (a, b) => (a.card?.onTimeBp ?? 10_001) - (b.card?.onTimeBp ?? 10_001),
};

/** Vendors joined to their scorecards, filtered and sorted as the address says. */
export function vendorRows(
  vendors: readonly Vendor[],
  cards: readonly VendorScorecard[],
  filters: VendorFilters,
): VendorRow[] {
  const needle = filters.search.trim().toLowerCase();
  return vendors
    .map((vendor) => ({ vendor, card: cards.find((card) => card.vendorId === vendor.id) ?? null }))
    .filter((row) => shown(row, filters.show))
    .filter(
      (row) =>
        !needle ||
        [row.vendor.name, row.vendor.gstin, row.vendor.contactName, row.vendor.phone].some(
          (value) => value?.toLowerCase().includes(needle),
        ),
    )
    .sort(SORTERS[filters.sort]);
}
