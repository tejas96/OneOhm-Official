import {
  billToPay,
  type MoneyOutMethod,
  planAdvanceAdjustments,
  vendorAdvanceAdjustedPosting,
  vendorAdvancePaidPosting,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import {
  goodsReceipts,
  payables,
  purchaseOrders,
  vendorAdvanceAdjustments,
  vendorAdvances,
  vendors,
} from '../schema';
import { postJournal } from './post-journal';

const OUT_METHODS: readonly MoneyOutMethod[] = ['cash', 'cheque', 'bank_transfer', 'upi'];

/** A paid advance: the money leaves the bank (or cash) and the vendor owes goods. */
export async function postVendorAdvancePaid(
  db: DatabaseExecutor,
  advanceId: string,
  userId: string | null,
): Promise<void> {
  const [row] = await db
    .select({ advance: vendorAdvances, vendor: vendors.name, order: purchaseOrders })
    .from(vendorAdvances)
    .innerJoin(vendors, eq(vendors.id, vendorAdvances.vendorId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, vendorAdvances.purchaseOrderId))
    .where(eq(vendorAdvances.id, advanceId))
    .limit(1);
  if (row?.advance.status !== 'paid') return;
  const { advance } = row;
  const paidOn = advance.paidOn;
  if (!paidOn) return;
  const method = OUT_METHODS.find((entry) => entry === advance.paidMethod) ?? 'bank_transfer';
  const reference = advance.paidReference ? ` · ${advance.paidReference}` : '';
  await postJournal(db, {
    entryDate: paidOn,
    memo: `Vendor advance paid · ${advance.number} · ${row.vendor} · ${row.order.number}${reference}`,
    sourceType: 'vendor_advance_paid',
    sourceId: advance.id,
    projectId: row.order.projectId,
    postedByUserId: userId,
    lines: vendorAdvancePaidPosting({ method, amountPaise: advance.amountPaise }),
  });
}

/**
 * Sets the order's paid, unused advances against its approved, unpaid vendor bills
 * (oldest first), so only the balance stays payable. A bill the advance covers in full
 * is marked paid. Each adjustment is posted once: Dr vendor payables, Cr vendor advances.
 * Call it in the transaction that approves a bill or pays an advance.
 */
export async function applyVendorAdvances(
  db: DatabaseExecutor,
  purchaseOrderId: string,
  userId: string | null,
): Promise<number> {
  const advances = await db
    .select()
    .from(vendorAdvances)
    .where(
      and(
        eq(vendorAdvances.purchaseOrderId, purchaseOrderId),
        eq(vendorAdvances.status, 'paid'),
        gt(vendorAdvances.amountPaise, vendorAdvances.adjustedPaise),
      ),
    )
    .orderBy(asc(vendorAdvances.paidAt), asc(vendorAdvances.number))
    .for('update');
  if (advances.length === 0) return 0;
  const bills = await db
    .select({ payable: payables })
    .from(payables)
    .innerJoin(goodsReceipts, eq(goodsReceipts.payableId, payables.id))
    .where(
      and(
        eq(goodsReceipts.purchaseOrderId, purchaseOrderId),
        eq(payables.status, 'approved'),
        gt(payables.amountPaise, sql`${payables.advanceAdjustedPaise} + ${payables.tdsPaise}`),
      ),
    )
    .orderBy(asc(payables.createdAt))
    .for('update', { of: payables });
  const plan = planAdvanceAdjustments(
    advances.map((row) => ({ id: row.id, openPaise: row.amountPaise - row.adjustedPaise })),
    bills.map(({ payable }) => ({
      id: payable.id,
      balancePaise: billToPay(payable),
    })),
  );
  const today = todayIn();
  for (const step of plan) {
    const advance = advances.find((row) => row.id === step.advanceId);
    const bill = bills.find((row) => row.payable.id === step.payableId)?.payable;
    if (!advance || !bill) continue;
    await adjustOne(db, { advance, bill, amountPaise: step.amountPaise, today, userId });
  }
  return plan.length;
}

async function adjustOne(
  db: DatabaseExecutor,
  input: {
    readonly advance: typeof vendorAdvances.$inferSelect;
    readonly bill: typeof payables.$inferSelect;
    readonly amountPaise: number;
    readonly today: string;
    readonly userId: string | null;
  },
): Promise<void> {
  const { advance, bill, amountPaise, today, userId } = input;
  const [adjustment] = await db
    .insert(vendorAdvanceAdjustments)
    .values({
      advanceId: advance.id,
      payableId: bill.id,
      amountPaise,
      adjustedOn: today,
      createdByUserId: userId,
    })
    .onConflictDoNothing()
    .returning({ id: vendorAdvanceAdjustments.id });
  if (!adjustment) return;
  await db
    .update(vendorAdvances)
    .set({
      adjustedPaise: sql`${vendorAdvances.adjustedPaise} + ${amountPaise}`,
      updatedAt: new Date(),
    })
    .where(eq(vendorAdvances.id, advance.id));
  const [after] = await db
    .update(payables)
    .set({
      advanceAdjustedPaise: sql`${payables.advanceAdjustedPaise} + ${amountPaise}`,
      updatedAt: new Date(),
    })
    .where(eq(payables.id, bill.id))
    .returning({
      amountPaise: payables.amountPaise,
      advanceAdjustedPaise: payables.advanceAdjustedPaise,
      tdsPaise: payables.tdsPaise,
    });
  if (after && billToPay(after) <= 0) {
    await db
      .update(payables)
      .set({
        status: 'paid',
        paidAt: new Date(),
        paidOn: today,
        paidReference: `Adjusted against advance ${advance.number}`,
        paidByUserId: userId,
      })
      .where(eq(payables.id, bill.id));
  }
  await postJournal(db, {
    entryDate: today,
    memo: `Advance adjusted · ${advance.number} against ${bill.partyName} · ${bill.description}`,
    sourceType: 'vendor_advance_adjusted',
    sourceId: adjustment.id,
    projectId: bill.projectId,
    postedByUserId: userId,
    lines: vendorAdvanceAdjustedPosting({ amountPaise }),
  });
}
