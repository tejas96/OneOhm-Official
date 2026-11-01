/**
 * The service visit from the technician's phone (PRD 5.5, 4.2): check in at the site,
 * record what was found and done, then mark the work done or hand it back to the desk.
 */
export const SERVICE_OUTCOMES = ['done', 'handed_back'] as const;
export type ServiceOutcome = (typeof SERVICE_OUTCOMES)[number];

/** The longest note the technician writes for one field. */
export const SERVICE_NOTE_MAX = 2000;

export interface ServiceRequestState {
  readonly status: string;
  readonly respondedAt: Date | null;
}

/**
 * Checking in at the site answers the request (the first-response promise is met at
 * the first answer, whoever gives it) and puts an open request in progress.
 */
export function checkInChanges(
  request: ServiceRequestState,
  now: Date,
): { status?: 'in_progress'; respondedAt?: Date } {
  return {
    ...(request.status === 'open' ? { status: 'in_progress' as const } : {}),
    ...(request.respondedAt ? {} : { respondedAt: now }),
  };
}

export interface ServiceFinish {
  readonly outcome: ServiceOutcome;
  readonly found?: string | null | undefined;
  readonly workDone?: string | null | undefined;
  readonly reason?: string | null | undefined;
}

const filled = (value: string | null | undefined) => (value?.trim() ?? '').length > 0;

/**
 * What is missing before the work can be finished: "done" needs what was done (the
 * customer reads it), "hand back" needs the reason for the desk.
 */
export function finishProblems(finish: ServiceFinish): Record<string, string> {
  if (finish.outcome === 'done' && !filled(finish.workDone)) {
    return { workDone: 'Write what you did.' };
  }
  if (finish.outcome === 'handed_back' && !filled(finish.reason)) {
    return { reason: 'Say why you are handing it back.' };
  }
  return {};
}

/**
 * The request after finishing. Done resolves it (the note of what was done becomes the
 * resolution the customer sees) and answers it if nothing had yet. Handing back returns
 * it to the desk unassigned, its status unchanged, so it can be given to someone else.
 */
export function finishChanges(
  request: ServiceRequestState,
  finish: ServiceFinish,
  now: Date,
): {
  status?: 'resolved';
  assigneeUserId?: null;
  resolutionNote?: string;
  resolvedAt?: Date;
  respondedAt?: Date;
} {
  if (finish.outcome === 'handed_back') return { assigneeUserId: null };
  return {
    status: 'resolved',
    resolutionNote: (finish.workDone ?? '').trim(),
    resolvedAt: now,
    ...(request.respondedAt ? {} : { respondedAt: now }),
  };
}

export interface ServiceUrgency {
  readonly sla: { readonly response: string | null; readonly resolution: string | null };
  readonly resolutionDueAt: string | null;
  readonly scheduledFor: string | null;
  readonly createdAt: string;
}

const rankOf = (job: ServiceUrgency) => {
  const states = [job.sla.response, job.sla.resolution];
  if (states.includes('breached')) return 0;
  return states.includes('due_soon') ? 1 : 2;
};
const dueOf = (job: ServiceUrgency) =>
  new Date(job.resolutionDueAt ?? job.scheduledFor ?? job.createdAt).getTime();

/** The technician's list order: past a promise, then due soon, then by when it is due. */
export function byUrgency(left: ServiceUrgency, right: ServiceUrgency): number {
  return rankOf(left) - rankOf(right) || dueOf(left) - dueOf(right);
}
