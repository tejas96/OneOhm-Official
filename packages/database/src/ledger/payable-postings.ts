import { type MoneyOutMethod, payableApprovedPosting, payablePaidPosting } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { payables, projects } from '../schema';
import { postJournal } from './post-journal';
import { businessDate } from './receivable-postings';

const OUT_METHODS: readonly MoneyOutMethod[] = ['cash', 'cheque', 'bank_transfer', 'upi'];

async function loadPayable(db: DatabaseExecutor, payableId: string) {
  const [row] = await db
    .select({ payable: payables, code: projects.code })
    .from(payables)
    .leftJoin(projects, eq(projects.id, payables.projectId))
    .where(eq(payables.id, payableId))
    .limit(1);
  return row;
}

const memoOf = (row: { payable: typeof payables.$inferSelect; code: string | null }) =>
  [row.code, row.payable.partyName, row.payable.description].filter(Boolean).join(' · ');

/** An approved bill: the cost and what is owed are booked on the approval date. */
export async function postPayableApproved(
  db: DatabaseExecutor,
  payableId: string,
  userId: string | null,
): Promise<void> {
  const row = await loadPayable(db, payableId);
  if (!row || row.payable.status === 'pending') return;
  const { payable } = row;
  await postJournal(db, {
    entryDate: businessDate(payable.approvedAt ?? payable.updatedAt),
    memo: `Bill approved · ${memoOf(row)}`,
    sourceType: 'payable_approved',
    sourceId: payable.id,
    projectId: payable.projectId,
    postedByUserId: userId,
    lines: payableApprovedPosting({ party: payable.party, amountPaise: payable.amountPaise }),
  });
}

/** A bill paid: what is owed goes down, and so does the bank or cash it came from. */
export async function postPayablePaid(
  db: DatabaseExecutor,
  payableId: string,
  userId: string | null,
): Promise<void> {
  const row = await loadPayable(db, payableId);
  if (row?.payable.status !== 'paid') return;
  const { payable } = row;
  const method = OUT_METHODS.find((entry) => entry === payable.paidMethod) ?? 'bank_transfer';
  await postJournal(db, {
    entryDate: payable.paidOn ?? businessDate(payable.paidAt ?? payable.updatedAt),
    memo: `Bill paid · ${memoOf(row)}${payable.paidReference ? ` · ${payable.paidReference}` : ''}`,
    sourceType: 'payable_paid',
    sourceId: payable.id,
    projectId: payable.projectId,
    postedByUserId: userId,
    lines: payablePaidPosting({ party: payable.party, method, amountPaise: payable.amountPaise }),
  });
}
