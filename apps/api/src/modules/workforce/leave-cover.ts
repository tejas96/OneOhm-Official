import {
  type DatabaseExecutor,
  leaveRequests,
  type Notice,
  notify,
  notifyHolders,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';
import { daySpan } from '../../common/notices';

type LeaveRow = typeof leaveRequests.$inferSelect;

/** "Busy that week." → `: “Busy that week.”`, or nothing. */
const quoted = (note: string | null | undefined) => (note?.trim() ? `: “${note.trim()}”` : '.');

/**
 * What the backup, the applicant and the approvers hear as a cover is asked, answered or
 * dropped. Keys carry a stamp, so asking the same person again is a new alert.
 */
export const COVER_NOTICES = {
  asked: (leave: LeaveRow, applicant: string, stamp: number): Notice => ({
    kind: 'leave_cover_asked',
    title: `${applicant} asks you to cover`,
    body: `Leave ${daySpan(leave.fromDate, leave.toDate)}. Accept or decline${quoted(leave.handoverNote)}`,
    subject: { type: 'leave', id: leave.id },
    dedupeKey: `leave_cover_asked:${leave.id}:${stamp}`,
  }),
  answered: (leave: LeaveRow, backup: string, accept: boolean, stamp: number): Notice => ({
    kind: 'leave_cover_answered',
    title: accept ? `${backup} will cover` : `${backup} cannot cover`,
    body: `Leave ${daySpan(leave.fromDate, leave.toDate)}${quoted(leave.coverNote)}${
      accept ? '' : ' Ask someone else.'
    }`,
    subject: { type: 'leave', id: leave.id },
    dedupeKey: `leave_cover_answered:${leave.id}:${stamp}`,
  }),
  notNeeded: (leave: LeaveRow, applicant: string, why: string, stamp: number): Notice => ({
    kind: 'leave_cover_dropped',
    title: `Cover for ${applicant} not needed`,
    body: `Leave ${daySpan(leave.fromDate, leave.toDate)}: ${why}`,
    subject: { type: 'leave', id: leave.id },
    dedupeKey: `leave_cover_dropped:${leave.id}:${stamp}`,
  }),
  cancelledAfterHandover: (leave: LeaveRow, applicant: string): Notice => ({
    kind: 'leave_cover_cancelled',
    title: `${applicant} cancelled their leave`,
    body: `Leave ${daySpan(leave.fromDate, leave.toDate)}. The handed work stays with you until a manager moves it back.`,
    subject: { type: 'leave', id: leave.id },
    dedupeKey: `leave_cover_cancelled:${leave.id}`,
  }),
  approvedLeaveCancelled: (leave: LeaveRow, applicant: string, handed: number): Notice => ({
    kind: 'leave_cancelled',
    title: `${applicant} cancelled approved leave`,
    body:
      handed > 0
        ? `Leave ${daySpan(leave.fromDate, leave.toDate)}. ${handed === 1 ? '1 handed item stays' : `${handed} handed items stay`} with the backup; move them back if needed.`
        : `Leave ${daySpan(leave.fromDate, leave.toDate)}.`,
    subject: { type: 'leave', id: leave.id },
    dedupeKey: `leave_cancelled:${leave.id}`,
  }),
};

export async function nameOf(db: DatabaseExecutor, id: string): Promise<string> {
  const [row] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row?.fullName ?? 'a colleague';
}

/** A backup must be an active member of staff. */
export async function assertActiveStaff(db: DatabaseExecutor, userId: string): Promise<void> {
  const [person] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
    .where(and(eq(users.id, userId), eq(users.status, 'active')))
    .limit(1);
  if (!person) throw invalid('Pick an active team member.', { backupUserId: 'Not available.' });
}

/** A backup cannot cover days they are away themselves (pending or approved leave). */
export async function assertNotAway(
  db: DatabaseExecutor,
  backupId: string,
  leave: LeaveRow,
  message: string,
): Promise<void> {
  const [away] = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, backupId),
        ne(leaveRequests.id, leave.id),
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.fromDate, leave.toDate),
        gte(leaveRequests.toDate, leave.fromDate),
      ),
    )
    .limit(1);
  if (away) throw invalid(message, { backupUserId: 'On leave then.' });
}

/** The applicant and the approvers hear the backup's answer, with the note (once each). */
export async function tellCoverAnswer(
  db: DatabaseExecutor,
  leave: LeaveRow,
  accept: boolean,
): Promise<void> {
  if (!leave.backupUserId) return;
  const backup = await nameOf(db, leave.backupUserId);
  const notice = COVER_NOTICES.answered(leave, backup, accept, Date.now());
  // Same key shape as notifyHolders, so an applicant who also approves hears it once.
  await notify(
    db,
    { userId: leave.userId },
    { ...notice, dedupeKey: `${notice.dedupeKey}:${leave.userId}` },
  );
  await notifyHolders(db, 'leave.approve', notice, leave.backupUserId);
}

/** Asks a backup to cover: the request is marked asked and they get an alert. */
export async function askCover(db: DatabaseExecutor, leave: LeaveRow): Promise<void> {
  if (!leave.backupUserId) return;
  const applicant = await nameOf(db, leave.userId);
  await notify(
    db,
    { userId: leave.backupUserId },
    COVER_NOTICES.asked(leave, applicant, Date.now()),
  );
}

/** A backup who was asked or said yes hears they are no longer needed, and why. */
export async function dropCover(db: DatabaseExecutor, leave: LeaveRow, why: string): Promise<void> {
  if (!leave.backupUserId) return;
  if (leave.coverAnswer !== 'asked' && leave.coverAnswer !== 'accepted') return;
  const applicant = await nameOf(db, leave.userId);
  await notify(
    db,
    { userId: leave.backupUserId },
    COVER_NOTICES.notNeeded(leave, applicant, why, Date.now()),
  );
}

/**
 * Approval needs the named backup's yes (no work moves to anyone by force). Returns the
 * message to refuse with, or null when the backup may take the work.
 */
export function coverProblem(leave: LeaveRow, backupName: string): string | null {
  if (leave.coverAnswer === 'accepted') return null;
  if (leave.coverAnswer === 'declined') return `${backupName} declined to cover. Ask someone else.`;
  return `${backupName} has not answered yet. Wait for them, or ask someone else.`;
}
