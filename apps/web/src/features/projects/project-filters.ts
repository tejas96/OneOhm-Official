import type { ProjectSummary } from '@oneohm/api-contracts';

export const STATUS_FILTERS = ['live', 'completed', 'cancelled', 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const TYPE_FILTERS = ['all', 'residential', 'society', 'commercial'] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

/** Health as the owner reads it: fine, needs attention, or held by someone outside. */
export const HEALTH_FILTERS = [
  'any',
  'onTrack',
  'attention',
  'customer',
  'bank',
  'discom',
] as const;
export type HealthFilter = (typeof HEALTH_FILTERS)[number];

export const SORTS = ['due', 'attention', 'newest', 'name', 'size'] as const;
export type SortKey = (typeof SORTS)[number];

export const LAYOUTS = ['cards', 'table'] as const;
export type Layout = (typeof LAYOUTS)[number];

export interface ProjectFilters {
  readonly search: string;
  readonly status: StatusFilter;
  readonly health: HealthFilter;
  readonly type: TypeFilter;
  readonly sort: SortKey;
  readonly view: Layout;
}

export const DEFAULT_FILTERS: ProjectFilters = {
  search: '',
  status: 'live',
  health: 'any',
  type: 'all',
  sort: 'due',
  view: 'cards',
};

/** Worst first, for "Needs attention first". */
const SEVERITY: Readonly<Record<ProjectSummary['tone'], number>> = {
  overdue: 0,
  blocked: 1,
  atRisk: 2,
  waiting: 3,
  review: 4,
  onTrack: 5,
  neutral: 6,
  done: 7,
};

function matchesStatus(project: ProjectSummary, status: StatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'live') return project.status === 'active' || project.status === 'operational';
  return project.status === status;
}

function matchesHealth(project: ProjectSummary, health: HealthFilter): boolean {
  if (health === 'any') return true;
  if (health === 'onTrack') return project.tone === 'onTrack';
  if (health === 'attention')
    return project.tone === 'atRisk' || project.tone === 'overdue' || project.tone === 'blocked';
  return project.waitingOn === health;
}

function matchesSearch(project: ProjectSummary, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [project.code, project.name, project.place, project.discom].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

const COMPARE: Readonly<Record<SortKey, (left: ProjectSummary, right: ProjectSummary) => number>> =
  {
    due: (left, right) =>
      (left.next?.date ?? '9999').localeCompare(right.next?.date ?? '9999') ||
      left.code.localeCompare(right.code),
    attention: (left, right) =>
      SEVERITY[left.tone] - SEVERITY[right.tone] || right.overdueTasks - left.overdueTasks,
    newest: (left, right) => right.code.localeCompare(left.code),
    name: (left, right) => left.name.localeCompare(right.name),
    size: (left, right) => right.capacityWp - left.capacityWp,
  };

/** The projects that pass every filter, in the chosen order. */
export function filterProjects(
  projects: readonly ProjectSummary[],
  filters: ProjectFilters,
): ProjectSummary[] {
  return projects
    .filter(
      (project) =>
        matchesStatus(project, filters.status) &&
        (filters.type === 'all' || project.type === filters.type) &&
        matchesHealth(project, filters.health) &&
        matchesSearch(project, filters.search),
    )
    .sort(COMPARE[filters.sort]);
}

/** True when anything other than the defaults narrows the list. */
export function isFiltered(filters: ProjectFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.health !== DEFAULT_FILTERS.health ||
    filters.type !== DEFAULT_FILTERS.type
  );
}
