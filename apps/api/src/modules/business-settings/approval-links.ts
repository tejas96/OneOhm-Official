import type { PendingApprovalRow } from '@oneohm/database';

/** Where an approval is decided in full on the web (the inbox also approves in place). */
export function approvalHref(item: PendingApprovalRow): string {
  switch (item.kind) {
    case 'task_review':
    case 'assignee_confirm':
      return item.projectId ? `/projects/${item.projectId}?tab=tasks` : '/command-center/tasks';
    case 'discount':
      return `/quotations/${item.id}`;
    case 'leave':
      return '/team?tab=leave';
    case 'attendance_correction':
      return '/team?tab=attendance';
    case 'travel_claim':
      return '/team?tab=travel';
    case 'purchase_request':
      return `/inventory?tab=requests&status=all&request=${item.id}`;
    case 'vendor_advance':
      return '/finance?tab=advances';
    case 'bill':
      return '/finance?tab=payables&filter=pending';
    case 'points':
      return '/team?tab=points';
    case 'bonus':
      return '/team?tab=bonuses';
    case 'commission':
      return '/finance?tab=payouts';
    case 'referral_reward':
      return '/finance?tab=payouts&view=referrals';
  }
}

/** The inbox filtered to some kinds, for links from the command centre. */
export function inboxHref(kinds: readonly string[]): string {
  return `/today?tab=approvals&kind=${kinds.join(',')}`;
}
