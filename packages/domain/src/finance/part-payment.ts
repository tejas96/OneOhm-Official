import { formatInr } from '@oneohm/shared';
import { billToPay } from './tds';

/** The smallest part that can be paid: ₹1. */
export const MIN_PART_PAISE = 100;

/** A bill's money figures, with what has been paid so far. */
export interface BillMoney {
  readonly amountPaise: number;
  readonly tdsPaise: number;
  readonly advanceAdjustedPaise: number;
  readonly paidPaise: number;
}

/** What is still to pay: the bill's to-pay less what was paid so far, never below zero. */
export function leftToPay(bill: BillMoney): number {
  return Math.max(0, billToPay(bill) - bill.paidPaise);
}

/**
 * Whether a part of a bill can be paid now: a whole number of paise, at least ₹1, and no
 * more than what is left. Returns the plain-words problem, or null when it is fine.
 */
export function partPaymentProblem(amountPaise: number, leftPaise: number): string | null {
  if (!Number.isInteger(amountPaise)) return 'Enter the amount in rupees and paise.';
  if (leftPaise <= 0) return 'Nothing is left to pay on this bill.';
  if (amountPaise < MIN_PART_PAISE) return 'The least you can pay is ₹1.';
  if (amountPaise > leftPaise) {
    return `That is more than what is left to pay (${formatInr(leftPaise)}).`;
  }
  return null;
}

/** How much a payment is above what was left: money paid beyond the bill. */
export const overpaidBy = (amountPaise: number, leftPaise: number): number =>
  Math.max(0, amountPaise - Math.max(0, leftPaise));
