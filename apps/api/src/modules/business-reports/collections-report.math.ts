import type { CollectionsReport } from '@oneohm/api-contracts';
import { AGEING_BUCKETS, ageingBucket, share } from '@oneohm/domain';
import { daysBetween } from '@oneohm/shared';

type Method = CollectionsReport['byMethod'][number]['method'];
export type Payer = 'customer' | 'bank';

/** Money moving in (positive) or back out (negative) on a day, for collections. */
export interface MoneyMove {
  readonly payer: Payer;
  readonly method: Method;
  readonly amountPaise: number;
  readonly on: string;
}

/** One payment milestone with what has been paid against it so far. */
export interface MilestoneFact {
  readonly projectId: string;
  readonly payer: Payer;
  readonly amountPaise: number;
  readonly paidPaise: number;
  readonly paid: boolean;
  /** The India date it fell due; null until its event happens. */
  readonly dueOn: string | null;
}

/** Where a milestone stands today: what is left, whether it is due, and for how long. */
export interface Standing {
  readonly outstandingPaise: number;
  readonly due: boolean;
  /** Days since it fell due (0 on the day); null when not due. */
  readonly daysPastDue: number | null;
  /** Its due date is before today. */
  readonly overdue: boolean;
}

export function standing(milestone: MilestoneFact, today: string): Standing {
  const outstandingPaise = milestone.paid
    ? 0
    : Math.max(0, milestone.amountPaise - milestone.paidPaise);
  const due = milestone.dueOn !== null && milestone.dueOn <= today;
  const daysPastDue = due && milestone.dueOn ? daysBetween(milestone.dueOn, today) : null;
  return { outstandingPaise, due, daysPastDue, overdue: daysPastDue !== null && daysPastDue > 0 };
}

/** Unpaid money that has fallen due, by how long ago: 0–30, 31–60, 61–90, over 90 days. */
export function ageingRows(
  milestones: readonly MilestoneFact[],
  today: string,
): CollectionsReport['ageing'] {
  const rows = AGEING_BUCKETS.map((bucket) => ({
    bucket,
    customerPaise: 0,
    bankPaise: 0,
    milestones: 0,
  }));
  for (const milestone of milestones) {
    const now = standing(milestone, today);
    if (now.daysPastDue === null || now.outstandingPaise === 0) continue;
    const row = rows[AGEING_BUCKETS.indexOf(ageingBucket(now.daysPastDue))];
    if (!row) continue;
    if (milestone.payer === 'bank') row.bankPaise += now.outstandingPaise;
    else row.customerPaise += now.outstandingPaise;
    row.milestones += 1;
  }
  return rows;
}

/**
 * Of the milestones that fell due in the range, how much is paid by now (never more than
 * each milestone's amount). Null when nothing fell due.
 */
export function collectionRate(
  milestones: readonly MilestoneFact[],
  range: { readonly start: string; readonly end: string },
) {
  let fellDuePaise = 0;
  let fellDuePaidPaise = 0;
  for (const milestone of milestones) {
    if (!milestone.dueOn || milestone.dueOn < range.start || milestone.dueOn > range.end) continue;
    fellDuePaise += milestone.amountPaise;
    fellDuePaidPaise += milestone.paid
      ? milestone.amountPaise
      : Math.min(milestone.amountPaise, Math.max(0, milestone.paidPaise));
  }
  return { fellDuePaise, fellDuePaidPaise, collectionRate: share(fellDuePaidPaise, fellDuePaise) };
}

const METHODS: readonly Method[] = [
  'cash',
  'cheque',
  'bank_transfer',
  'upi',
  'razorpay',
  'bank_disbursement',
];

/** Money in and back out per method; methods with no movement are left out. */
export function methodRows(moves: readonly MoneyMove[]): CollectionsReport['byMethod'] {
  return METHODS.map((method) => {
    const ofMethod = moves.filter((move) => move.method === method);
    const receivedPaise = ofMethod
      .filter((move) => move.amountPaise > 0)
      .reduce((sum, move) => sum + move.amountPaise, 0);
    const returnedPaise = ofMethod
      .filter((move) => move.amountPaise < 0)
      .reduce((sum, move) => sum - move.amountPaise, 0);
    return { method, receivedPaise, returnedPaise, netPaise: receivedPaise - returnedPaise };
  }).filter((row) => row.receivedPaise + row.returnedPaise > 0);
}

/** Net money in, split by payer. */
export function netByPayer(moves: readonly MoneyMove[]) {
  const sum = (payer: Payer) =>
    moves.filter((move) => move.payer === payer).reduce((acc, move) => acc + move.amountPaise, 0);
  return { customerPaise: sum('customer'), bankPaise: sum('bank') };
}
