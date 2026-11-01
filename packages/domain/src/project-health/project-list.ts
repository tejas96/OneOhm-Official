import type { WaitingParty } from '../epc/stages';
import { FINISH_WINDOWS, finishWindow } from './delivery-forecast';
import { ATTENTION_TONES, type ProjectTone } from './project-state';

/**
 * The project list's filters and orders (PRD 3.1), one rule for the API, which pages
 * the list, and the screens that link into it (`?health=overdue`, `?status=all`).
 */
export const PROJECT_STATUS_FILTERS = ['live', 'completed', 'cancelled', 'all'] as const;
export type ProjectStatusFilter = (typeof PROJECT_STATUS_FILTERS)[number];

export const PROJECT_TYPE_FILTERS = ['all', 'residential', 'society', 'commercial'] as const;
export type ProjectTypeFilter = (typeof PROJECT_TYPE_FILTERS)[number];

/** Health as the owner reads it: fine, needs attention (or one kind of it), or held by someone outside. */
export const PROJECT_HEALTH_FILTERS = [
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
export type ProjectHealthFilter = (typeof PROJECT_HEALTH_FILTERS)[number];

/** When the project is expected to finish (`deliveryForecast`), or running behind plan. */
export const PROJECT_FINISH_FILTERS = ['any', ...FINISH_WINDOWS, 'behind'] as const;
export type ProjectFinishFilter = (typeof PROJECT_FINISH_FILTERS)[number];

export const PROJECT_SORTS = ['due', 'attention', 'newest', 'name', 'size'] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export interface ProjectListFilters {
  readonly search: string;
  readonly status: ProjectStatusFilter;
  readonly health: ProjectHealthFilter;
  readonly type: ProjectTypeFilter;
  readonly sort: ProjectSort;
  /** A project manager's id; empty for everyone. */
  readonly manager: string;
  readonly finish: ProjectFinishFilter;
  /** Completed projects whose work finished on or after this date (YYYY-MM-DD); empty for any. */
  readonly since: string;
}

/** What the rules read from a project card. */
export interface ListedProject {
  readonly code: string;
  readonly name: string;
  readonly place: string;
  readonly discom: string;
  readonly type: string;
  readonly status: 'active' | 'operational' | 'completed' | 'cancelled';
  readonly capacityWp: number;
  readonly tone: ProjectTone;
  readonly waitingOn: WaitingParty | null;
  readonly overdueTasks: number;
  readonly next: { readonly date: string } | null;
  readonly manager: { readonly id: string } | null;
  readonly forecast: { readonly slipDays: number; readonly expectedFinish: string | null };
  readonly completedOn: string | null;
}

/** Worst first, for "Needs attention first". */
const SEVERITY: Readonly<Record<ProjectTone, number>> = {
  overdue: 0,
  blocked: 1,
  atRisk: 2,
  waiting: 3,
  review: 4,
  onTrack: 5,
  neutral: 6,
  done: 7,
};

export function matchesProjectStatus(
  project: Pick<ListedProject, 'status'>,
  status: ProjectStatusFilter,
): boolean {
  if (status === 'all') return true;
  if (status === 'live') return project.status === 'active' || project.status === 'operational';
  return project.status === status;
}

function matchesHealth(project: ListedProject, health: ProjectHealthFilter): boolean {
  if (health === 'any') return true;
  // The same tones the command centre counts as "needing attention".
  if (health === 'attention') return ATTENTION_TONES.includes(project.tone);
  if (health === 'customer' || health === 'bank' || health === 'discom')
    return project.waitingOn === health;
  return project.tone === health;
}

function matchesFinish(project: ListedProject, finish: ProjectFinishFilter, today: string) {
  if (finish === 'any') return true;
  if (finish === 'behind') return project.forecast.slipDays > 0;
  const expected = project.forecast.expectedFinish;
  return expected !== null && finishWindow(expected, today) === finish;
}

function matchesSince(project: ListedProject, since: string): boolean {
  return !since || (project.completedOn !== null && project.completedOn >= since);
}

/** Every word of the search appears in the code, name, place or DISCOM. */
export function matchesProjectSearch(
  project: Pick<ListedProject, 'code' | 'name' | 'place' | 'discom'>,
  search: string,
): boolean {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [project.code, project.name, project.place, project.discom]
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const COMPARE: Readonly<
  Record<ProjectSort, (left: ListedProject, right: ListedProject) => number>
> = {
  due: (left, right) =>
    (left.next?.date ?? '9999').localeCompare(right.next?.date ?? '9999') ||
    left.code.localeCompare(right.code),
  attention: (left, right) =>
    SEVERITY[left.tone] - SEVERITY[right.tone] ||
    right.overdueTasks - left.overdueTasks ||
    left.code.localeCompare(right.code),
  newest: (left, right) => right.code.localeCompare(left.code),
  name: (left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code),
  size: (left, right) => right.capacityWp - left.capacityWp || left.code.localeCompare(right.code),
};

/** The projects that pass every filter, in the chosen order (ties broken by code, so pages hold still). */
export function filterProjectList<T extends ListedProject>(
  projects: readonly T[],
  filters: ProjectListFilters,
  today: string,
): T[] {
  return projects
    .filter(
      (project) =>
        matchesProjectStatus(project, filters.status) &&
        (filters.type === 'all' || project.type === filters.type) &&
        matchesHealth(project, filters.health) &&
        matchesProjectSearch(project, filters.search) &&
        (!filters.manager || project.manager?.id === filters.manager) &&
        matchesFinish(project, filters.finish, today) &&
        matchesSince(project, filters.since),
    )
    .sort(COMPARE[filters.sort]);
}
