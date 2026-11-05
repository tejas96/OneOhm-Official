import type { Capability } from '../identity/capabilities';
import { type ApprovalPolicy, approversFor } from '../settings/approval-policy';

/**
 * Everything that waits for someone's yes (PRD 7.1 "approval workflows"), gathered in
 * one "Waiting for my approval" list. Task reviews follow the task's own reviewers.
 */
export const APPROVAL_KINDS = [
  'task_review',
  'assignee_confirm',
  'discount',
  'leave',
  'attendance_correction',
  'travel_claim',
  'purchase_request',
  'vendor_advance',
  'bill',
  /** A request to send a bank transfer for an approved bill; an approver sends it. */
  'bank_payout',
  'points',
  'bonus',
  'commission',
  'referral_reward',
] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

/** One waiting approval, as every reader of the list sees it. */
export interface PendingApproval {
  readonly kind: ApprovalKind;
  readonly id: string;
  readonly requestedAt: string;
  /** Who asked, or whose work it is. */
  readonly requestedByUserId: string | null;
  /** More people who may not approve it (a bonus's own sharers). */
  readonly excludedUserIds?: readonly string[];
  readonly amountPaise: number | null;
  /** Task reviews only: who may review it (from the task's reviewers). */
  readonly reviewerIds?: readonly string[];
}

const FIXED: Readonly<Record<Exclude<ApprovalKind, 'task_review' | 'bill' | 'bonus'>, Capability>> =
  {
    assignee_confirm: 'tasks.assign',
    discount: 'quotations.approve_discount',
    leave: 'leave.approve',
    attendance_correction: 'leave.approve',
    travel_claim: 'leave.approve',
    purchase_request: 'procurement.manage',
    vendor_advance: 'finance.approve_payments',
    bank_payout: 'finance.approve_payments',
    points: 'people.manage',
    commission: 'finance.approve_payments',
    referral_reward: 'finance.approve_payments',
  };

/** The rights that let someone approve this item, under the money limits in Settings. */
export function approvalRights(
  item: Pick<PendingApproval, 'kind' | 'amountPaise'>,
  policy: ApprovalPolicy,
): readonly Capability[] {
  const amount = item.amountPaise ?? 0;
  switch (item.kind) {
    case 'task_review':
      return ['tasks.approve'];
    case 'bill':
      return approversFor(
        amount,
        policy.billLimitPaise,
        'finance.approve_payments',
        'finance.record_payments',
      );
    case 'bonus':
      return approversFor(
        amount,
        policy.bonusLimitPaise,
        'finance.approve_payments',
        'people.manage',
      );
    default:
      return [FIXED[item.kind]];
  }
}

/**
 * Kinds whose own endpoint refuses the requester's own yes; for the rest the person who
 * raised it may still be its only approver (often the owner), so it stays in their list.
 */
const NOT_OWN: ReadonlySet<ApprovalKind> = new Set([
  'assignee_confirm',
  'leave',
  'attendance_correction',
  'travel_claim',
  'points',
  'bank_payout',
]);

/** True when the item is this person's own leave, attendance fix, claim or points, or names them as the proposed assignee. */
export function isOwnRequest(item: PendingApproval, userId: string): boolean {
  return NOT_OWN.has(item.kind) && item.requestedByUserId === userId;
}

export interface Approver {
  readonly userId: string;
  readonly capabilities: readonly string[];
}

/** True when this person may decide the item: the right rights, and not their own leave or claim. */
export function mayDecide(item: PendingApproval, who: Approver, policy: ApprovalPolicy): boolean {
  if (item.kind === 'task_review') return (item.reviewerIds ?? []).includes(who.userId);
  if (isOwnRequest(item, who.userId)) return false;
  if (item.excludedUserIds?.includes(who.userId)) return false;
  return approvalRights(item, policy).some((right) => who.capabilities.includes(right));
}

/** Whole days an approval has waited, by calendar date. */
export function waitingDays(requestedOn: string, today: string): number {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${requestedOn}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** True once an approval has waited longer than Settings allow; the owner hears then. */
export function approvalOverdue(requestedOn: string, today: string, policy: ApprovalPolicy) {
  return waitingDays(requestedOn, today) > policy.escalateAfterDays;
}
