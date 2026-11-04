import { overlaps } from './leave';

/** A leave request as far as clashes and approval go. */
export interface ClashLeave {
  readonly id: string;
  readonly userId: string;
  readonly backupUserId: string | null;
  readonly fromDate: string;
  readonly toDate: string;
  readonly status: string;
}

export interface LeaveClashes<T extends ClashLeave = ClashLeave> {
  /** The named backup's own leave (pending or approved) that overlaps these days. */
  readonly backupAway: readonly T[];
  /** Leave of others where this person is the backup, overlapping these days. */
  readonly covering: readonly T[];
}

const live = (leave: ClashLeave) => leave.status === 'pending' || leave.status === 'approved';

/**
 * Warnings for a leave request (not blocks): the backup is away on some of the days, or
 * the person asking is covering someone else on some of them. `others` is all leave.
 */
export function leaveClashes<T extends ClashLeave>(
  request: {
    readonly id?: string | undefined;
    readonly userId: string;
    readonly backupUserId: string | null;
    readonly fromDate: string;
    readonly toDate: string;
  },
  others: readonly T[],
): LeaveClashes<T> {
  const range = { from: request.fromDate, to: request.toDate };
  const touching = others.filter(
    (leave) =>
      leave.id !== request.id &&
      live(leave) &&
      overlaps(range, { from: leave.fromDate, to: leave.toDate }),
  );
  return {
    backupAway: request.backupUserId
      ? touching.filter((leave) => leave.userId === request.backupUserId)
      : [],
    covering: touching.filter(
      (leave) => leave.backupUserId === request.userId && leave.userId !== request.userId,
    ),
  };
}

export type ApproverProblem = 'own' | 'backup' | 'seniors_only';

/**
 * Who may decide a leave. Nobody decides their own, and the named backup does not
 * decide the leave they cover. When the applicant is a Super Admin, the other Super
 * Admins and the applicant's manager (`seniors`, active) decide it; if there are none,
 * anyone allowed to approve leave may, except the backup.
 */
export function leaveApproverProblem(input: {
  readonly approverId: string;
  readonly applicantId: string;
  readonly backupUserId: string | null;
  readonly applicantIsSuperAdmin: boolean;
  readonly seniors: readonly string[];
}): ApproverProblem | null {
  const { approverId, applicantId, backupUserId } = input;
  if (approverId === applicantId) return 'own';
  if (backupUserId && approverId === backupUserId) return 'backup';
  if (!input.applicantIsSuperAdmin) return null;
  const eligible = input.seniors.filter((id) => id !== applicantId && id !== backupUserId);
  return eligible.length > 0 && !eligible.includes(approverId) ? 'seniors_only' : null;
}

/** Whether a day falls inside any of the leave ranges (inclusive). */
export function onLeaveOn(
  ranges: readonly { readonly fromDate: string; readonly toDate: string }[],
  day: string,
): boolean {
  return ranges.some((range) => range.fromDate <= day && day <= range.toDate);
}
