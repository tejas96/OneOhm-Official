import type { Capability } from '../identity/capabilities';

/** Who ended a site visit: the person, a manager, or the end of the person's day. */
export const SITE_VISIT_CLOSERS = ['self', 'manager', 'day_end'] as const;
export type SiteVisitCloser = (typeof SITE_VISIT_CLOSERS)[number];

/** A planned visit (the `visits` table) a site check-in might belong to. */
export interface PlannedVisitCandidate {
  readonly id: string;
  readonly status: string;
  readonly day: string;
}

/**
 * The planned visit a check-in on `day` is for (live review S6): one still waiting
 * (proposed or confirmed) on that day, a confirmed one first. Null when none is planned.
 */
export function pickPlannedVisit(
  candidates: readonly PlannedVisitCandidate[],
  day: string,
): string | null {
  const open = candidates.filter(
    (one) => one.day === day && (one.status === 'confirmed' || one.status === 'proposed'),
  );
  return (open.find((one) => one.status === 'confirmed') ?? open[0])?.id ?? null;
}

/** Only a confirmed planned visit is marked done by a check-out; anything else is left. */
export const marksPlannedVisitDone = (status: string | null | undefined): boolean =>
  status === 'confirmed';

/** A visit closed for the person is never closed before it began. */
export function visitCloseAt(checkInAt: Date, closeAt: Date): Date {
  return closeAt.getTime() < checkInAt.getTime() ? checkInAt : closeAt;
}

/**
 * Who may force-close someone else's open visit (live review S1): whoever manages the
 * work it is on (projects for site tasks, service for requests), the project's manager,
 * or the person's own manager. The person never needs this: they check out by visit id.
 */
export function canForceCloseVisit(input: {
  readonly service: boolean;
  readonly capabilities: ReadonlySet<Capability>;
  readonly isProjectManager: boolean;
  readonly isReportingManager: boolean;
}): boolean {
  if (input.isProjectManager || input.isReportingManager) return true;
  return input.capabilities.has(input.service ? 'service.manage' : 'projects.manage');
}

/** How a site check-in happened (Duty Day step 3): a tap, the phone's site fence, or the route. */
export const CHECK_IN_SOURCES = ['manual', 'auto_fence', 'auto_route'] as const;
export type CheckInSource = (typeof CHECK_IN_SOURCES)[number];

/** How a site check-out happened; `task_complete` is the task finishing under the person. */
export const CHECK_OUT_SOURCES = [
  'manual',
  'auto_fence',
  'auto_route',
  'task_complete',
  'day_end',
  'force_close',
] as const;
export type CheckOutSource = (typeof CHECK_OUT_SOURCES)[number];

/** What the worker says when they leave a site before the job is done. */
export const LEAVE_REASONS = ['come_back_later', 'need_material', 'customer_not_home'] as const;
export type LeaveReason = (typeof LEAVE_REASONS)[number];

/** The reason in plain words, for the manager. */
export const LEAVE_REASON_WORDS: Readonly<Record<LeaveReason, string>> = {
  come_back_later: 'Will come back later',
  need_material: 'Needs material',
  customer_not_home: 'Customer was not home',
};

/** Made by the phone or the route, not by a tap. */
export const isAutoSource = (source: string | null | undefined): boolean =>
  source === 'auto_fence' || source === 'auto_route';

/** Only the phone's own events may be sent with a source (the route and the system act on the server). */
export const PHONE_SOURCES = ['manual', 'auto_fence'] as const;

/**
 * Why an automatic check-in was left alone without an error: the person has not left the
 * site since their last visit there closed, or the point is within two sites' fences.
 */
export const AUTO_SKIPS = ['must_leave_first', 'ambiguous_site'] as const;
export type AutoSkip = (typeof AUTO_SKIPS)[number];

/** Only a visit ended by a tap, the fence or the route can be explained with a leave reason. */
export const canExplainLeaving = (checkOutSource: string | null | undefined): boolean =>
  checkOutSource === 'manual' || checkOutSource === 'auto_fence' || checkOutSource === 'auto_route';
