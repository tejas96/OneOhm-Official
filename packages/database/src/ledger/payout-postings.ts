import { payoutFeePosting } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import type { DatabaseExecutor } from '../client';
import { postJournal } from './post-journal';

/** RazorpayX's fee for one payout, taken from the bank as a bank charge (PRD 3.11). */
export async function postPayoutFee(
  db: DatabaseExecutor,
  payout: {
    readonly id: string;
    readonly feePaise: number;
    readonly paidOn: string;
    readonly label: string;
    readonly projectId: string | null;
  },
): Promise<void> {
  if (payout.feePaise <= 0) return;
  await postJournal(db, {
    entryDate: payout.paidOn,
    memo: `${payout.label} · ${formatInr(payout.feePaise)} RazorpayX payout fee`,
    sourceType: 'payout_fee',
    sourceId: payout.id,
    projectId: payout.projectId,
    postedByUserId: null,
    lines: payoutFeePosting(payout.feePaise),
  });
}
