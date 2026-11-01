/** What the customer is told when one of their payment milestones falls due (PRD 6.2). */
export type MilestoneDueNotice =
  | { readonly send: false; readonly reason: 'bank_share' | 'paid' | 'final_link_follows' }
  | {
      readonly send: true;
      readonly message: 'payment_link' | 'payment_reminder';
      readonly owedPaise: number;
    };

export interface MilestoneDueFacts {
  readonly payer: 'customer' | 'bank';
  readonly amountPaise: number;
  readonly paidPaise: number;
  /** The project's last customer milestone (the final payment). */
  readonly final: boolean;
  readonly onlinePayments: boolean;
}

/**
 * The amount due, with a pay link when online payments are on, or a plain "due" note
 * otherwise. The bank's share is claimed from the bank, never asked of the customer. With
 * online payments on, the final payment's link is sent by itself (final-payment-link), so
 * this stays quiet rather than message twice.
 */
export function milestoneDueNotice(facts: MilestoneDueFacts): MilestoneDueNotice {
  if (facts.payer !== 'customer') return { send: false, reason: 'bank_share' };
  const owedPaise = facts.amountPaise - facts.paidPaise;
  if (owedPaise <= 0) return { send: false, reason: 'paid' };
  if (!facts.onlinePayments) return { send: true, message: 'payment_reminder', owedPaise };
  if (facts.final) return { send: false, reason: 'final_link_follows' };
  return { send: true, message: 'payment_link', owedPaise };
}
