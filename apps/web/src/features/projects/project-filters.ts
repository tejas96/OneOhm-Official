import type { ProjectSummary } from '@oneohm/api-contracts';
import { ATTENTION_TONES, FINISH_WINDOWS, finishWindow } from '@oneohm/domain';

export const STATUS_FILTERS = ['live', 'completed', 'cancelled', 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const TYPE_FILTERS = ['all', 'residential', 'society', 'commercial'] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

/** Health as the owner reads it: fine, needs attention (or one kind of it), or held by someone outside. */
export const HEALTH_FILTERS = [
  'any',
  'onTrack',
  'attention',
  'overdue',
  'blocked',
  'atRisk',
  'waiting',
  'customer',
  'bank',
  'discom',
] as const;
export type HealthFilter = (typeof HEALTH_FILTERS)[number];

/** When the project is expected to finish (`deliveryForecast`), or running behind plan. */
export const FINISH_FILTERS = ['any', ...FINISH_WINDOWS, 'behind'] as const;
export type FinishFilter = (typeof FINISH_FILTERS)[number];

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
  /** A project manager's id, from the command centre; empty for everyone. */
  readonly manager: string;
  readonly finish: FinishFilter;
  /** Completed projects whose work finished on or after this date (YYYY-MM-DD); empty for any. */
  readonly since: string;
}

export const DEFAULT_FILTERS: ProjectFilters = {
  search: '',
  status: 'live',
  health: 'any',
  type: 'all',
  sort: 'due',
  view: 'cards',
  manager: '',
  finish: 'any',
  since: '',
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
  // The same tones the command centre counts as "needing attention".
  if (health === 'attention') return ATTENTION_TONES.includes(project.tone);
  if (health === 'customer' || health === 'bank' || health === 'discom')
    return project.waitingOn === health;
  return project.tone === health;
}

function matchesFinish(project: ProjectSummary, finish: FinishFilter, today: string): boolean {
  if (finish === 'any') return true;
  if (finish === 'behind') return project.forecast.slipDays > 0;
  const expected = project.forecast.expectedFinish;
  return expected !== null && finishWindow(expected, today) === finish;
}

function matchesSince(project: ProjectSummary, since: string): boolean {
  return !since || (project.completedOn !== null && project.completedOn >= since);
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
  today: string,
): ProjectSummary[] {
  return projects
    .filter(
      (project) =>
        matchesStatus(project, filters.status) &&
        (filters.type === 'all' || project.type === filters.type) &&
        matchesHealth(project, filters.health) &&
        matchesSearch(project, filters.search) &&
        (!filters.manager || project.manager?.id === filters.manager) &&
        matchesFinish(project, filters.finish, today) &&
        matchesSince(project, filters.since),
    )
    .sort(COMPARE[filters.sort]);
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
