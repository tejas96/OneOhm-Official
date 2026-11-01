import {
  type IncentiveKind,
  incentiveApprovedPosting,
  incentivePaidPosting,
  type MoneyOutMethod,
} from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { commissionEntries, customers, projects, referralRewards, users } from '../schema';
import { postJournal } from './post-journal';
import { businessDate } from './receivable-postings';

const OUT_METHODS: readonly MoneyOutMethod[] = ['cash', 'cheque', 'bank_transfer', 'upi'];

interface IncentiveRow {
  readonly id: string;
  readonly projectId: string;
  readonly code: string;
  readonly party: string;
  readonly status: string;
  readonly amountPaise: number;
  readonly approvedAt: Date | null;
  readonly paidAt: Date | null;
  readonly paidOn: string | null;
  readonly paidMethod: string | null;
  readonly paidReference: string | null;
}

async function loadIncentive(
  db: DatabaseExecutor,
  kind: IncentiveKind,
  id: string,
): Promise<IncentiveRow | undefined> {
  if (kind === 'referral_reward') {
    const [row] = await db
      .select({ entry: referralRewards, code: projects.code, party: customers.name })
      .from(referralRewards)
      .innerJoin(projects, eq(projects.id, referralRewards.projectId))
      .innerJoin(customers, eq(customers.id, referralRewards.referrerCustomerId))
      .where(eq(referralRewards.id, id))
      .limit(1);
    return row && { ...row.entry, code: row.code, party: row.party };
  }
  const [row] = await db
    .select({ entry: commissionEntries, code: projects.code, party: users.fullName })
    .from(commissionEntries)
    .innerJoin(projects, eq(projects.id, commissionEntries.projectId))
    .innerJoin(users, eq(users.id, commissionEntries.resellerUserId))
    .where(eq(commissionEntries.id, id))
    .limit(1);
  return row && { ...row.entry, code: row.code, party: row.party };
}

const LABEL: Readonly<Record<IncentiveKind, string>> = {
  referral_reward: 'Referral reward',
  commission: 'Reseller commission',
};

/** An approved reward or commission: the expense and what is owed, booked once. */
export async function postIncentiveApproved(
  db: DatabaseExecutor,
  kind: IncentiveKind,
  id: string,
  userId: string | null,
): Promise<void> {
  const row = await loadIncentive(db, kind, id);
  if (!row || row.status === 'pending' || row.status === 'rejected' || row.amountPaise <= 0) {
    return;
  }
  await postJournal(db, {
    entryDate: businessDate(row.approvedAt ?? new Date()),
    memo: `${LABEL[kind]} approved · ${row.code} · ${row.party} · ${formatInr(row.amountPaise)}`,
    sourceType: kind === 'referral_reward' ? 'referral_reward_approved' : 'commission_approved',
    sourceId: row.id,
    projectId: row.projectId,
    postedByUserId: userId,
    lines: incentiveApprovedPosting({ kind, amountPaise: row.amountPaise }),
  });
}

/** A reward or commission paid out of the bank or cash, booked once. */
export async function postIncentivePaid(
  db: DatabaseExecutor,
  kind: IncentiveKind,
  id: string,
  userId: string | null,
): Promise<void> {
  const row = await loadIncentive(db, kind, id);
  if (row?.status !== 'paid' || row.amountPaise <= 0) return;
  const method = OUT_METHODS.find((entry) => entry === row.paidMethod) ?? 'bank_transfer';
  await postJournal(db, {
    entryDate: row.paidOn ?? businessDate(row.paidAt ?? new Date()),
    memo: `${LABEL[kind]} paid · ${row.code} · ${row.party}${row.paidReference ? ` · ${row.paidReference}` : ''}`,
    sourceType: kind === 'referral_reward' ? 'referral_reward_paid' : 'commission_paid',
    sourceId: row.id,
    projectId: row.projectId,
    postedByUserId: userId,
    lines: incentivePaidPosting({ method, amountPaise: row.amountPaise }),
  });
}
