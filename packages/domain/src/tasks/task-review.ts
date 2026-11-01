/**
 * Who signs off a task that needs approval (PRD 3.7): anyone who approves tasks, or the
 * project's manager. Nobody approves their own work while someone else can.
 */
export const TASK_REVIEWERS = ['approvers', 'project_manager'] as const;
export type TaskReviewer = (typeof TASK_REVIEWERS)[number];

export interface ReviewPeople {
  readonly reviewer: TaskReviewer;
  /** The project's manager, if it has one. */
  readonly managerUserId: string | null;
  /** Active people who hold `tasks.approve`. */
  readonly approvers: readonly string[];
}

export type ReviewRoute =
  | { readonly kind: 'review'; readonly reviewers: readonly string[] }
  /** The person who did the work is the only one who could approve it. */
  | { readonly kind: 'self' };

/**
 * Where finished work goes when `doer` completes it. The designated reviewer comes first;
 * when that is the doer, anyone else who approves tasks reviews it instead. Only when
 * nobody else could does the doer's own sign-off stand (and it is marked in the audit).
 * With nobody able to approve at all, it waits in review for whoever gets the right.
 */
export function reviewRoute(people: ReviewPeople, doer: string): ReviewRoute {
  const designated =
    people.reviewer === 'project_manager' && people.managerUserId
      ? [people.managerUserId]
      : people.approvers;
  const others = designated.filter((id) => id !== doer);
  if (others.length > 0) return { kind: 'review', reviewers: unique(others) };
  const fallback = people.approvers.filter((id) => id !== doer);
  if (fallback.length > 0) return { kind: 'review', reviewers: unique(fallback) };
  if (designated.includes(doer) || people.approvers.includes(doer)) return { kind: 'self' };
  return { kind: 'review', reviewers: [] };
}

/** The people who may approve or send back work that `doer` sent for review. */
export function reviewersOf(people: ReviewPeople, doer: string | null): readonly string[] {
  // Work sent before submitters were recorded goes to the designated reviewers.
  if (!doer) return designatedOf(people);
  const route = reviewRoute(people, doer);
  return route.kind === 'review' ? route.reviewers : [doer];
}

function designatedOf(people: ReviewPeople): readonly string[] {
  return people.reviewer === 'project_manager' && people.managerUserId
    ? [people.managerUserId]
    : unique(people.approvers);
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

/** Share of finished tasks that were never sent back for correction (0–1), or null. */
export function firstTimeRightRate(finished: number, reworked: number): number | null {
  if (finished <= 0) return null;
  return Math.max(0, finished - reworked) / finished;
}
