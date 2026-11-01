import type { Payer } from './payment-milestones';

/**
 * The final payment link (PRD 3.11, Flow D step 3): when the customer's last milestone
 * falls due, the Razorpay link goes to the customer by itself, once. The bank's share is
 * never sent a link; it is claimed from the bank.
 */

/** Only milestones that fell due this recently get a link by themselves, never old dues. */
export const FINAL_LINK_WINDOW_DAYS = 3;

export type MilestoneState = 'upcoming' | 'due' | 'partly_paid' | 'paid';

export interface PlacedMilestone {
  readonly id: string;
  readonly projectId: string;
  readonly payer: Payer;
  readonly position: number;
}

/** Each project's last customer milestone, by position: the final payment. */
export function finalCustomerMilestones(
  milestones: readonly PlacedMilestone[],
): ReadonlySet<string> {
  const last = new Map<string, PlacedMilestone>();
  for (const milestone of milestones) {
    if (milestone.payer !== 'customer') continue;
    const current = last.get(milestone.projectId);
    if (!current || milestone.position > current.position) last.set(milestone.projectId, milestone);
  }
  return new Set([...last.values()].map((milestone) => milestone.id));
}

export interface FinalLinkFacts {
  /** Online payments are switched on (sandbox or live keys). */
  readonly onlinePayments: boolean;
  readonly payer: Payer;
  readonly status: MilestoneState;
  readonly dueAt: Date | null;
  readonly amountPaise: number;
  readonly paidPaise: number;
  /** The project's last customer milestone. */
  readonly final: boolean;
  /** A link was already made for it: by hand, by the WhatsApp assistant or by this rule. */
  readonly linked: boolean;
}

export type FinalLinkSkip =
  | 'payments_off'
  | 'bank_share'
  | 'not_final'
  | 'not_due'
  | 'paid'
  | 'already_linked'
  | 'too_old';

export type FinalLinkDecision =
  | { readonly send: true; readonly amountPaise: number }
  | { readonly send: false; readonly reason: FinalLinkSkip };

const DAY_MS = 86_400_000;

/** Whether to make and send the final payment link now, and for how much. */
export function finalLinkDecision(facts: FinalLinkFacts, now: Date): FinalLinkDecision {
  const skip = (reason: FinalLinkSkip): FinalLinkDecision => ({ send: false, reason });
  if (!facts.onlinePayments) return skip('payments_off');
  if (facts.payer !== 'customer') return skip('bank_share');
  if (!facts.final) return skip('not_final');
  if (facts.status === 'paid') return skip('paid');
  if (facts.status === 'upcoming' || !facts.dueAt) return skip('not_due');
  const owed = facts.amountPaise - facts.paidPaise;
  if (owed <= 0) return skip('paid');
  if (facts.linked) return skip('already_linked');
  if (now.getTime() - facts.dueAt.getTime() > FINAL_LINK_WINDOW_DAYS * DAY_MS)
    return skip('too_old');
  return { send: true, amountPaise: owed };
}
