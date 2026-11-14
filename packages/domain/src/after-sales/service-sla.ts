import { DEFAULT_CALENDAR, zonedInstant } from '../calendar/business-calendar';
/**
 * Service levels (PRD 7.2 "Service categories and SLAs"): each category promises a first
 * response and a resolution within so many hours. Hours run around the clock.
 */
export type SlaState = 'on_track' | 'due_soon' | 'breached' | 'met' | 'missed';

/** The last quarter of the allowed time counts as "due soon". */
export const SLA_WARN_SHARE = 0.25;

const HOUR_MS = 3_600_000;

export interface SlaClock {
  /** When the clock started: the request was raised, or a visit's day began. */
  readonly startedAt: Date;
  readonly dueAt: Date | null;
  /** When it was answered (response) or resolved (resolution). */
  readonly doneAt: Date | null;
}

/** Where one clock stands; null when the request has no service level (older requests). */
export function slaState(clock: SlaClock, now: Date): SlaState | null {
  if (!clock.dueAt) return null;
  const due = clock.dueAt.getTime();
  if (clock.doneAt) return clock.doneAt.getTime() <= due ? 'met' : 'missed';
  if (now.getTime() > due) return 'breached';
  const allowed = Math.max(0, due - clock.startedAt.getTime());
  return due - now.getTime() <= allowed * SLA_WARN_SHARE ? 'due_soon' : 'on_track';
}

export const hoursAfter = (at: Date, hours: number) => new Date(at.getTime() + hours * HOUR_MS);

/** Midnight, in the business time zone, at the start of a calendar date. */
export const dayStartsAt = (date: string, timeZone = DEFAULT_CALENDAR.timeZone) =>
  zonedInstant(date, 0, timeZone);

export interface SlaHours {
  readonly responseHours: number;
  readonly resolutionHours: number;
}

/**
 * When a new request must be answered and resolved. A scheduled visit is answered by
 * confirming it with the customer; its resolution clock starts on the visit day.
 */
export function slaDueDates(
  hours: SlaHours,
  raisedAt: Date,
  scheduledFor?: string | null,
  timeZone?: string,
): { readonly responseDueAt: Date; readonly resolutionDueAt: Date } {
  const resolutionFrom = scheduledFor ? dayStartsAt(scheduledFor, timeZone) : raisedAt;
  return {
    responseDueAt: hoursAfter(raisedAt, hours.responseHours),
    resolutionDueAt: hoursAfter(resolutionFrom, hours.resolutionHours),
  };
}

export interface SlaRequest {
  readonly createdAt: Date;
  readonly responseDueAt: Date | null;
  readonly respondedAt: Date | null;
  readonly resolutionDueAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly scheduledFor: string | null;
}

export interface SlaStatus {
  readonly response: SlaState | null;
  readonly resolution: SlaState | null;
}

/** Both clocks of a request. Resolving a request also answers it. */
export function serviceSla(request: SlaRequest, now: Date, timeZone?: string): SlaStatus {
  return {
    response: slaState(
      {
        startedAt: request.createdAt,
        dueAt: request.responseDueAt,
        doneAt: request.respondedAt ?? request.resolvedAt,
      },
      now,
    ),
    resolution: slaState(
      {
        startedAt: request.scheduledFor
          ? dayStartsAt(request.scheduledFor, timeZone)
          : request.createdAt,
        dueAt: request.resolutionDueAt,
        doneAt: request.resolvedAt,
      },
      now,
    ),
  };
}

/** True when either clock ran out, whether or not the request is closed since. */
export function slaBreached(status: SlaStatus): boolean {
  return [status.response, status.resolution].some(
    (state) => state === 'breached' || state === 'missed',
  );
}

/** The alert a clock deserves now; each stage alerts once. */
export function slaAlertStage(state: SlaState | null): 'due_soon' | 'breached' | null {
  return state === 'due_soon' || state === 'breached' ? state : null;
}
