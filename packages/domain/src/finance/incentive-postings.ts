import { ACCOUNT } from './ledger-accounts';
import { cashAccountFor, type JournalLine, type MoneyOutMethod } from './ledger-postings';

/** A customer's referral reward or a reseller's commission. */
export type IncentiveKind = 'referral_reward' | 'commission';

const expenseFor = (kind: IncentiveKind) =>
  kind === 'referral_reward' ? ACCOUNT.referralRewards : ACCOUNT.resellerCommission;

/**
 * Approved: the reward is a marketing expense (a commission a cost of sale), and OneOhm
 * owes it to the customer or reseller until it is paid.
 */
export function incentiveApprovedPosting(input: {
  readonly kind: IncentiveKind;
  readonly amountPaise: number;
}): JournalLine[] {
  return [
    { account: expenseFor(input.kind), debitPaise: input.amountPaise, creditPaise: 0 },
    { account: ACCOUNT.incentivePayables, debitPaise: 0, creditPaise: input.amountPaise },
  ];
}

/** Paid: what is owed goes down, and so does the bank or cash it came from. */
export function incentivePaidPosting(input: {
  readonly method: MoneyOutMethod;
  readonly amountPaise: number;
}): JournalLine[] {
  return [
    { account: ACCOUNT.incentivePayables, debitPaise: input.amountPaise, creditPaise: 0 },
    { account: cashAccountFor(input.method), debitPaise: 0, creditPaise: input.amountPaise },
  ];
}
