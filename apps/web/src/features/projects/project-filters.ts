import type { ProjectSummary } from '@oneohm/api-contracts';

export const STATUS_FILTERS = ['live', 'completed', 'cancelled', 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const TYPE_FILTERS = ['all', 'residential', 'society', 'commercial'] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

export const WAITING_FILTERS = ['all', 'internal', 'customer', 'bank', 'discom', 'none'] as const;
export type WaitingFilter = (typeof WAITING_FILTERS)[number];

export interface ProjectFilters {
  readonly status: StatusFilter;
  readonly type: TypeFilter;
  readonly waiting: WaitingFilter;
  readonly search: string;
}

export const DEFAULT_FILTERS: ProjectFilters = {
  status: 'live',
  type: 'all',
  waiting: 'all',
  search: '',
};

function matchesStatus(project: ProjectSummary, status: StatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'live') return project.status === 'active' || project.status === 'operational';
  return project.status === status;
}

function matchesWaiting(project: ProjectSummary, waiting: WaitingFilter): boolean {
  if (waiting === 'all') return true;
  if (waiting === 'none') return project.waitingOn === null;
  return project.waitingOn === waiting;
}

function matchesSearch(project: ProjectSummary, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [project.code, project.name, project.place, project.discom].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

/** The projects that pass every filter, in the order the API sent them. */
export function filterProjects(
  projects: readonly ProjectSummary[],
  filters: ProjectFilters,
): ProjectSummary[] {
  return projects.filter(
    (project) =>
      matchesStatus(project, filters.status) &&
      (filters.type === 'all' || project.type === filters.type) &&
      matchesWaiting(project, filters.waiting) &&
      matchesSearch(project, filters.search),
  );
}
