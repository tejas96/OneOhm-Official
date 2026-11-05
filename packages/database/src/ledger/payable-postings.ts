import { contractorTdsPosting, payableApprovedPosting } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { contractors, payables, projects, workOrders } from '../schema';
import { postJournal } from './post-journal';
import { businessDate } from './receivable-postings';

export async function loadPayable(db: DatabaseExecutor, payableId: string) {
  const [row] = await db
    .select({ payable: payables, code: projects.code })
    .from(payables)
    .leftJoin(projects, eq(projects.id, payables.projectId))
    .where(eq(payables.id, payableId))
    .limit(1);
  return row;
}

export const memoOf = (row: { payable: typeof payables.$inferSelect; code: string | null }) =>
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
    lines: payableApprovedPosting({
      party: payable.party,
      amountPaise: payable.amountPaise,
      tdsPaise: payable.tdsPaise,
    }),
  });
}

/**
 * A settled work order's TDS: cost of the work, owed to the government (PRD 3.13).
 * Booked once, on the day the order settled.
 */
export async function postWorkOrderTds(
  db: DatabaseExecutor,
  workOrderId: string,
  userId: string | null,
): Promise<void> {
  const [row] = await db
    .select({ order: workOrders, contractor: contractors.name, code: projects.code })
    .from(workOrders)
    .innerJoin(contractors, eq(contractors.id, workOrders.contractorId))
    .innerJoin(projects, eq(projects.id, workOrders.projectId))
    .where(eq(workOrders.id, workOrderId))
    .limit(1);
  if (row?.order.status !== 'completed' || row.order.tdsPaise <= 0) return;
  await postJournal(db, {
    entryDate: businessDate(row.order.completedAt ?? row.order.updatedAt),
    memo: `TDS held · ${row.code} · ${row.contractor} · ${row.order.number}`,
    sourceType: 'work_order_tds',
    sourceId: row.order.id,
    projectId: row.order.projectId,
    postedByUserId: userId,
    lines: contractorTdsPosting({ amountPaise: row.order.tdsPaise }),
  });
}
