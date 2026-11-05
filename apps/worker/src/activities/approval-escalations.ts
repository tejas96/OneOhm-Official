import {
  type Database,
  listPendingApprovals,
  notify,
  type PendingApprovalRow,
  readBusinessSetting,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import {
  type ApprovalKind,
  approvalOverdue,
  isOwnRequest,
  SUPER_ADMIN_ROLE_KEY,
  waitingDays,
} from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq, isNull } from 'drizzle-orm';

const WHAT: Readonly<Record<ApprovalKind, string>> = {
  task_review: 'Task to approve',
  assignee_confirm: 'Person to confirm for a task',
  discount: 'Discount to approve',
  leave: 'Leave request',
  attendance_correction: 'Attendance correction',
  travel_claim: 'Travel claim',
  purchase_request: 'Purchase request',
  vendor_advance: 'Vendor advance',
  bill: 'Bill to approve',
  bank_payout: 'Bank transfer to send',
  points: 'Points to approve',
  bonus: 'Bonus to approve',
  commission: 'Reseller commission',
  referral_reward: 'Referral reward',
};

/** The owner: everyone active in the Super Admin role, the next approver up. */
async function owners(db: Database): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(and(eq(users.status, 'active'), eq(roles.key, SUPER_ADMIN_ROLE_KEY)));
  return rows.map((row) => row.id);
}

function body(item: PendingApprovalRow, days: number): string {
  const parts = [
    item.projectCode,
    item.subject,
    item.requesterName ? `from ${item.requesterName}` : null,
    item.amountPaise !== null ? formatInr(item.amountPaise) : null,
  ].filter(Boolean);
  return `${parts.join(' · ')}. Waiting ${days} days.`;
}

/**
 * Each morning, approvals waiting longer than Settings → Approvals allows go up to the
 * owner (PRD 7.1 "approval workflows, reminders and escalations"). Each one alerts
 * once, so a long wait is raised, not repeated.
 */
export async function queueApprovalEscalations(db: Database, timeZone: string): Promise<number> {
  const today = todayIn(timeZone);
  const [pending, policy, ownerIds] = await Promise.all([
    listPendingApprovals(db),
    readBusinessSetting(db, 'approvals'),
    owners(db),
  ]);
  let raised = 0;
  for (const item of pending) {
    const asked = todayIn(timeZone, new Date(item.requestedAt));
    if (!approvalOverdue(asked, today, policy)) continue;
    const days = waitingDays(asked, today);
    const to = ownerIds.filter((id) => !isOwnRequest(item, id));
    for (const userId of to) {
      await notify(
        db,
        { userId },
        {
          kind: 'approval_overdue',
          title: `${WHAT[item.kind]} waiting ${days} days`,
          body: body(item, days),
          subject: { type: 'approval', id: item.id, projectId: item.projectId },
          dedupeKey: `approval_overdue:${item.kind}:${item.id}:${userId}`,
        },
      );
    }
    if (to.length > 0) raised += 1;
  }
  return raised;
}
