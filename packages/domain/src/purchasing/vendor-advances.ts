import { ACCOUNT, type LedgerAccountCode } from '../finance/ledger-accounts';
import { cashAccountFor, type JournalLine, type MoneyOutMethod } from '../finance/ledger-postings';

/**
 * Advances paid to a vendor against a purchase order (PRD 3.10, 3.11). Recorded, then
 * approved, then paid, like a bill. Once paid it is an asset (the vendor owes goods);
 * when the vendor's bill for that order is approved the advance is set against it, so
 * only the balance stays payable.
 */
export const VENDOR_ADVANCE_STATUSES = ['pending', 'approved', 'paid', 'cancelled'] as const;
export type VendorAdvanceStatus = (typeof VENDOR_ADVANCE_STATUSES)[number];

export type VendorAdvanceStep = 'approve' | 'pay' | 'cancel';

const FROM: Readonly<Record<VendorAdvanceStep, readonly VendorAdvanceStatus[]>> = {
  approve: ['pending'],
  pay: ['approved'],
  cancel: ['pending', 'approved'],
};

export function canStepAdvance(status: VendorAdvanceStatus, step: VendorAdvanceStep): boolean {
  return FROM[step].includes(status);
}

/** How much more can be advanced on an order: its total less live advances. */
export function advanceRoom(orderTotalPaise: number, liveAdvancesPaise: number): number {
  return Math.max(0, orderTotalPaise - liveAdvancesPaise);
}

export interface OpenAdvance {
  readonly id: string;
  /** Paid but not yet set against a bill. */
  readonly openPaise: number;
}

export interface UnpaidBill {
  readonly id: string;
  /** What is still to pay on the bill after earlier adjustments. */
  readonly balancePaise: number;
}

export interface AdvanceAdjustment {
  readonly advanceId: string;
  readonly payableId: string;
  readonly amountPaise: number;
}

/**
 * Sets open advances against approved bills, oldest first on both sides, never more
 * than either has left. What is not matched stays open for the next bill.
 */
export function planAdvanceAdjustments(
  advances: readonly OpenAdvance[],
  bills: readonly UnpaidBill[],
): AdvanceAdjustment[] {
  const left = advances.map((advance) => ({ id: advance.id, open: advance.openPaise }));
  const plan: AdvanceAdjustment[] = [];
  for (const bill of bills) {
    let owed = bill.balancePaise;
    for (const advance of left) {
      if (owed <= 0) break;
      if (advance.open <= 0) continue;
      const amount = Math.min(owed, advance.open);
      plan.push({ advanceId: advance.id, payableId: bill.id, amountPaise: amount });
      advance.open -= amount;
      owed -= amount;
    }
  }
  return plan;
}

const line = (account: LedgerAccountCode, debitPaise: number, creditPaise: number) => ({
  account,
  debitPaise,
  creditPaise,
});

/** An advance paid: the vendor owes OneOhm goods, and the bank or cash goes down. */
export function vendorAdvancePaidPosting(input: {
  readonly method: MoneyOutMethod;
  readonly amountPaise: number;
}): JournalLine[] {
  return [
    line(ACCOUNT.vendorAdvances, input.amountPaise, 0),
    line(cashAccountFor(input.method), 0, input.amountPaise),
  ];
}

/** An advance set against an approved bill: less is owed, and the advance is used up. */
export function vendorAdvanceAdjustedPosting(input: {
  readonly amountPaise: number;
}): JournalLine[] {
  return [
    line(ACCOUNT.vendorPayables, input.amountPaise, 0),
    line(ACCOUNT.vendorAdvances, 0, input.amountPaise),
  ];
}
