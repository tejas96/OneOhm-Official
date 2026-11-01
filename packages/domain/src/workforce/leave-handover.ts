/**
 * Leave and the work it touches (PRD 4.6, Flow E). Ordinary leave with affected work is
 * approved only with someone to cover it; emergency leave may go ahead without, and is
 * flagged so the gap is visible.
 */
export type LeaveTaskReason = 'overdue' | 'due' | 'spans';

/**
 * Why an open task is affected by a leave window, or null when it is not: already late,
 * due inside the window, or started before the window ends and due after it.
 */
export function leaveTaskReason(
  task: { readonly startDate: string; readonly dueDate: string },
  window: { readonly fromDate: string; readonly toDate: string },
  today: string,
): LeaveTaskReason | null {
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate >= window.fromDate && task.dueDate <= window.toDate) return 'due';
  if (task.dueDate > window.toDate && task.startDate <= window.toDate) return 'spans';
  return null;
}

export type HandoverProblem = 'backup_needed' | 'backup_is_self';

export interface HandoverDecision {
  readonly problem: HandoverProblem | null;
  /** Approved with work affected and nobody covering it (emergency only). */
  readonly skipped: boolean;
}

/** Checks an approval: who covers the affected work, or an emergency going ahead without. */
export function checkHandover(input: {
  readonly affected: number;
  readonly backupUserId: string | null;
  readonly leaveUserId: string;
  readonly emergency: boolean;
  readonly skip: boolean;
}): HandoverDecision {
  if (input.backupUserId && input.backupUserId === input.leaveUserId)
    return { problem: 'backup_is_self', skipped: false };
  if (input.affected === 0 || input.backupUserId) return { problem: null, skipped: false };
  if (input.emergency && input.skip) return { problem: null, skipped: true };
  return { problem: 'backup_needed', skipped: false };
}
