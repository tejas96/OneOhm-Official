/** A gap between page numbers ("1 … 5 6 7 … 25"). */
export const GAP = 'gap' as const;
export type PageSlot = number | typeof GAP;

/**
 * The page buttons to show: always the first and last page and the pages next to the
 * current one, with a gap where pages are left out. Short lists show every page.
 */
export function pageNumbers(current: number, pageCount: number): PageSlot[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const page = Math.min(Math.max(current, 1), pageCount);
  // Near either end, show five pages there so the row keeps the same width.
  const start = page <= 4 ? 2 : page >= pageCount - 3 ? pageCount - 4 : page - 1;
  const end = page <= 4 ? 5 : page >= pageCount - 3 ? pageCount - 1 : page + 1;
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return [
    1,
    ...(start > 2 ? [GAP] : []),
    ...middle,
    ...(end < pageCount - 1 ? [GAP] : []),
    pageCount,
  ];
}

/** How many pages `total` rows fill, at least one. */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The page asked for in the address: a whole number from 1, else the first page. */
export function pageFromParam(raw: string | null): number {
  const page = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(page) && page >= 1 ? page : 1;
}
