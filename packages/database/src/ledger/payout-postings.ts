import { type LedgerAccountCode, payoutFeePosting, reversalPosting } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { journalEntries, journalLines } from '../schema';
import { postJournal } from './post-journal';

/**
 * RazorpayX's fee for one payout, taken from the bank (PRD 3.11). The fee includes GST:
 * the GST part goes to the input credit account, the rest is a bank charge.
 */
export async function postPayoutFee(
  db: DatabaseExecutor,
  payout: {
    readonly id: string;
    readonly feePaise: number;
    readonly feeTaxPaise: number;
    readonly paidOn: string;
    readonly label: string;
    readonly projectId: string | null;
  },
): Promise<void> {
  if (payout.feePaise <= 0) return;
  const posting = {
    entryDate: payout.paidOn,
    memo: `${payout.label} · ${formatInr(payout.feePaise)} RazorpayX payout fee`,
    sourceType: 'payout_fee',
    projectId: payout.projectId,
    postedByUserId: null,
    lines: payoutFeePosting(payout.feePaise, payout.feeTaxPaise),
  } as const;
  // A fee already refunded (the payout failed) that RazorpayX then takes again (it went
  // through after all) is booked a second time under its own source.
  if (await postJournal(db, { ...posting, sourceId: payout.id })) return;
  if (await entryOf(db, 'payout_fee_refund', payout.id))
    await postJournal(db, { ...posting, sourceId: againId(payout.id) });
}

const againId = (id: string) => `${id}:again`;

async function entryOf(
  db: DatabaseExecutor,
  sourceType: 'payout_fee' | 'payout_fee_refund',
  sourceId: string,
) {
  const [entry] = await db
    .select({ id: journalEntries.id, projectId: journalEntries.projectId })
    .from(journalEntries)
    .where(and(eq(journalEntries.sourceType, sourceType), eq(journalEntries.sourceId, sourceId)))
    .limit(1);
  return entry ?? null;
}

/**
 * RazorpayX gives the fee back when a payout fails or comes back. This posts the mirror of
 * exactly what was booked for the payout, once. If no fee was booked, nothing is posted.
 */
export async function refundPayoutFee(
  db: DatabaseExecutor,
  payout: { readonly id: string; readonly paidOn: string; readonly label: string },
): Promise<void> {
  // The newest booking first: the second one exists only after a first refund.
  for (const sourceId of [againId(payout.id), payout.id]) {
    const booked = await entryOf(db, 'payout_fee', sourceId);
    if (!booked) continue;
    if (await entryOf(db, 'payout_fee_refund', sourceId)) return;
    const lines = await db
      .select({
        account: journalLines.accountCode,
        debitPaise: journalLines.debitPaise,
        creditPaise: journalLines.creditPaise,
      })
      .from(journalLines)
      .where(eq(journalLines.entryId, booked.id))
      .orderBy(asc(journalLines.position));
    await postJournal(db, {
      entryDate: payout.paidOn,
      memo: `${payout.label} · RazorpayX payout fee given back`,
      sourceType: 'payout_fee_refund',
      sourceId,
      projectId: booked.projectId,
      reversesEntryId: booked.id,
      postedByUserId: null,
      lines: reversalPosting(lines.map((l) => ({ ...l, account: l.account as LedgerAccountCode }))),
    });
    return;
  }
}
