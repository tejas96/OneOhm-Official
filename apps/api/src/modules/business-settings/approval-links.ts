import type { PendingApprovalRow } from '@oneohm/database';

/**
 * Where an approval is decided in full on the web (the inbox also approves in place).
 * Every link names the item itself, so "Open" lands on that one record, not a whole list.
 */
export function approvalHref(item: Pick<PendingApprovalRow, 'kind' | 'id' | 'projectId'>): string {
  const { id } = item;
  switch (item.kind) {
    case 'task_review':
    case 'assignee_confirm':
      return item.projectId
        ? `/projects/${item.projectId}?tab=tasks&task=${id}`
        : `/command-center/tasks?task=${id}`;
    case 'discount':
      return `/quotations/${id}`;
    case 'leave':
      return `/team?tab=leave&leave=${id}`;
    case 'attendance_correction':
      return `/team?tab=attendance&correction=${id}`;
    case 'travel_claim':
      return `/team?tab=travel&claim=${id}`;
    case 'purchase_request':
      return `/inventory?tab=requests&status=all&request=${id}`;
    case 'vendor_advance':
      // The advances list holds only the newest few hundred; pending keeps an old one in it.
      return `/finance?tab=advances&filter=pending&advance=${id}`;
    case 'bill':
    case 'bank_payout':
      return `/finance?tab=payables&bill=${id}`;
    case 'points':
      return `/team?tab=points&points=${id}`;
    case 'bonus':
      return `/team?tab=bonuses&bonus=${id}`;
    case 'commission':
      return `/finance?tab=payouts&payout=${id}`;
    case 'referral_reward':
      return `/finance?tab=payouts&view=referrals&payout=${id}`;
  }
}

/** The inbox filtered to some kinds, for links from the command centre. */
export function inboxHref(kinds: readonly string[]): string {
  return `/today?tab=approvals&kind=${kinds.join(',')}`;
}
