import type { PurchaseRequest } from '@oneohm/api-contracts';

export const STATUS_FILTERS = [
  'open',
  'pending',
  'approved',
  'ordered',
  'rejected',
  'cancelled',
  'all',
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const SCOPE_FILTERS = ['any', 'projects', 'stock', 'mine'] as const;
export type ScopeFilter = (typeof SCOPE_FILTERS)[number];

export interface RequestFilters {
  readonly status: StatusFilter;
  readonly scope: ScopeFilter;
  readonly search: string;
}

const pick = <T extends string>(values: readonly T[], raw: string | null, fallback: T): T =>
  values.find((value) => value === raw) ?? fallback;

/** Filters live in the address so a filtered list can be shared and reloaded. */
export function readFilters(params: URLSearchParams): RequestFilters {
  return {
    status: pick(STATUS_FILTERS, params.get('status'), 'open'),
    scope: pick(SCOPE_FILTERS, params.get('scope'), 'any'),
    search: params.get('q') ?? '',
  };
}

function matchesStatus(request: PurchaseRequest, status: StatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'open') return request.status === 'pending' || request.status === 'approved';
  return request.status === status;
}

function matchesScope(request: PurchaseRequest, scope: ScopeFilter, userId: string): boolean {
  if (scope === 'projects') return request.project !== null;
  if (scope === 'stock') return request.project === null;
  if (scope === 'mine') return request.requestedBy.id === userId;
  return true;
}

function matchesSearch(request: PurchaseRequest, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    request.number,
    request.reason,
    request.project?.code,
    request.project?.name,
    request.requestedBy.fullName,
    request.purchaseOrder?.number,
    ...request.lines.flatMap((line) => [line.name, line.sku]),
  ].some((value) => value?.toLowerCase().includes(needle));
}

/** Open requests first by need-by date; the rest newest first, as the API sends them. */
export function applyFilters(
  rows: readonly PurchaseRequest[],
  filters: RequestFilters,
  userId: string,
): PurchaseRequest[] {
  const shown = rows.filter(
    (row) =>
      matchesStatus(row, filters.status) &&
      matchesScope(row, filters.scope, userId) &&
      matchesSearch(row, filters.search),
  );
  if (filters.status !== 'open') return shown;
  return [...shown].sort((a, b) => (a.neededBy ?? '').localeCompare(b.neededBy ?? ''));
}
