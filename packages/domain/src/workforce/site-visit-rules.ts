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
