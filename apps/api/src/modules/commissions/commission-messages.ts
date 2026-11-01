import {
  commissionEntries,
  customers,
  type DatabaseExecutor,
  notify,
  notifyHolders,
  projects,
  users,
} from '@oneohm/database';
import type { IncentiveStatus } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';

const RESELLER_TITLE: Readonly<Record<IncentiveStatus, string>> = {
  pending: 'Commission earned',
  approved: 'Commission approved',
  paid: 'Commission paid',
  rejected: 'Commission not approved',
};

const FINANCE_NEXT: Partial<Record<IncentiveStatus, { capability: string; title: string }>> = {
  pending: { capability: 'finance.approve_payments', title: 'Commission to approve' },
  approved: { capability: 'finance.record_payments', title: 'Commission to pay' },
};

/** Tells the reseller about each step of a commission, and finance what to do next. */
export async function announceCommission(
  db: DatabaseExecutor,
  entryId: string,
  actorUserId: string | null,
): Promise<void> {
  const [row] = await db
    .select({
      entry: commissionEntries,
      code: projects.code,
      customer: customers.name,
      reseller: users.fullName,
    })
    .from(commissionEntries)
    .innerJoin(projects, eq(projects.id, commissionEntries.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .innerJoin(users, eq(users.id, commissionEntries.resellerUserId))
    .where(eq(commissionEntries.id, entryId))
    .limit(1);
  if (!row) return;
  const { entry } = row;
  const amount = formatInr(entry.amountPaise);
  const detail =
    entry.status === 'rejected'
      ? `${row.code} · ${row.customer}: ${amount}. ${entry.rejectReason ?? ''}`.trim()
      : `${row.code} · ${row.customer}: ${amount}.${entry.paidReference ? ` Ref ${entry.paidReference}.` : ''}`;
  await notify(
    db,
    { userId: entry.resellerUserId },
    {
      kind: 'commission',
      title: RESELLER_TITLE[entry.status],
      body: detail,
      dedupeKey: `commission:${entry.id}:${entry.status}`,
    },
  );
  const next = FINANCE_NEXT[entry.status];
  if (!next) return;
  await notifyHolders(
    db,
    next.capability,
    {
      kind: 'commission',
      title: next.title,
      body: `${amount} to ${row.reseller} for ${row.code} (${row.customer}).`,
      dedupeKey: `commission:${entry.id}:${entry.status}`,
    },
    actorUserId,
  );
}
