import type { ProjectPageQuery } from '@oneohm/api-contracts';
import {
  PROJECT_FINISH_FILTERS,
  PROJECT_HEALTH_FILTERS,
  PROJECT_SORTS,
  PROJECT_STATUS_FILTERS,
  PROJECT_TYPE_FILTERS,
  type ProjectFinishFilter,
  type ProjectHealthFilter,
  type ProjectListFilters,
  type ProjectSort,
  type ProjectStatusFilter,
  type ProjectTypeFilter,
} from '@oneohm/domain';

// The filters themselves are the domain's, so the API pages the list by the same rules.
export const STATUS_FILTERS = PROJECT_STATUS_FILTERS;
export type StatusFilter = ProjectStatusFilter;
export const TYPE_FILTERS = PROJECT_TYPE_FILTERS;
export type TypeFilter = ProjectTypeFilter;
export const HEALTH_FILTERS = PROJECT_HEALTH_FILTERS;
export type HealthFilter = ProjectHealthFilter;
export const FINISH_FILTERS = PROJECT_FINISH_FILTERS;
export type FinishFilter = ProjectFinishFilter;
export const SORTS = PROJECT_SORTS;
export type SortKey = ProjectSort;

export const LAYOUTS = ['cards', 'table'] as const;
export type Layout = (typeof LAYOUTS)[number];

export interface ProjectFilters extends ProjectListFilters {
  readonly view: Layout;
}

export const DEFAULT_FILTERS: ProjectFilters = {
  search: '',
  status: 'live',
  health: 'any',
  type: 'all',
  sort: 'due',
  view: 'table',
  manager: '',
  finish: 'any',
  since: '',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The filters as the paged list asks the API for them (the layout stays on screen). */
export function pageQueryOf(filters: ProjectFilters): Omit<ProjectPageQuery, 'limit' | 'cursor'> {
  return {
    status: filters.status,
    health: filters.health,
    type: filters.type,
    sort: filters.sort,
    finish: filters.finish,
    ...(filters.search.trim() ? { q: filters.search.trim() } : {}),
    ...(UUID.test(filters.manager) ? { manager: filters.manager } : {}),
    ...(filters.since ? { since: filters.since } : {}),
  };
}

/** True when anything other than the defaults narrows the list. */
export function isFiltered(filters: ProjectFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.health !== DEFAULT_FILTERS.health ||
    filters.type !== DEFAULT_FILTERS.type ||
    filters.manager !== '' ||
    filters.finish !== 'any' ||
    filters.since !== ''
  );
}
