import {
  contractors,
  type DatabaseExecutor,
  goodsReceipts,
  purchaseOrders,
  vendors,
  workOrderAdvances,
  workOrders,
} from '@oneohm/database';
import { eq, or } from 'drizzle-orm';
import type { BankDetails } from './payout-gateway';

/** Who a bill is paid to, and their bank details if OneOhm has them. */
export interface Payee {
  readonly kind: 'vendor' | 'contractor';
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly bank: Partial<BankDetails>;
  /** The 24-hour hold after saved bank details changed (see `bank-hold.ts`). */
  readonly hold: PayeeHold;
}

export interface PayeeHold {
  readonly heldUntil: Date | null;
  readonly releasedAt: Date | null;
  readonly changedByUserId: string | null;
}

const holdOf = (row: {
  bankHoldUntil: Date | null;
  bankHoldReleasedAt: Date | null;
  bankChangedByUserId: string | null;
}): PayeeHold => ({
  heldUntil: row.bankHoldUntil,
  releasedAt: row.bankHoldReleasedAt,
  changedByUserId: row.bankChangedByUserId,
});

const bankOf = (row: {
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
}): Partial<BankDetails> => ({
  ...(row.bankAccountName ? { name: row.bankAccountName.trim() } : {}),
  ...(row.bankAccountNumber ? { accountNumber: row.bankAccountNumber.replace(/\s+/g, '') } : {}),
  ...(row.bankIfsc ? { ifsc: row.bankIfsc.trim().toUpperCase() } : {}),
});

/**
 * The payee behind a bill: the vendor of the goods receipt that raised it, or the
 * contractor of the work order (its bill, retention or advance). Bills typed in by hand
 * name nobody, so they are paid outside OneOhm.
 */
export async function payeeOf(db: DatabaseExecutor, payableId: string): Promise<Payee | null> {
  const [vendor] = await db
    .select({ vendor: vendors })
    .from(goodsReceipts)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(eq(goodsReceipts.payableId, payableId))
    .limit(1);
  if (vendor) {
    return {
      kind: 'vendor',
      id: vendor.vendor.id,
      name: vendor.vendor.name,
      phone: vendor.vendor.phoneE164,
      bank: bankOf(vendor.vendor),
      hold: holdOf(vendor.vendor),
    };
  }
  const [crew] = await db
    .select({ contractor: contractors })
    .from(workOrders)
    .innerJoin(contractors, eq(contractors.id, workOrders.contractorId))
    .where(or(eq(workOrders.payableId, payableId), eq(workOrders.retentionPayableId, payableId)))
    .limit(1);
  const [advance] = crew
    ? []
    : await db
        .select({ contractor: contractors })
        .from(workOrderAdvances)
        .innerJoin(workOrders, eq(workOrders.id, workOrderAdvances.workOrderId))
        .innerJoin(contractors, eq(contractors.id, workOrders.contractorId))
        .where(eq(workOrderAdvances.payableId, payableId))
        .limit(1);
  const found = crew ?? advance;
  if (!found) return null;
  return {
    kind: 'contractor',
    id: found.contractor.id,
    name: found.contractor.name,
    phone: found.contractor.phoneE164,
    bank: bankOf(found.contractor),
    hold: holdOf(found.contractor),
  };
}
