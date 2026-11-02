import type { ProjectDetail } from '@oneohm/api-contracts';
import { CUSTOMER_TDS_METHODS } from '@oneohm/domain';
import { rupeesToPaise } from '@oneohm/shared';
import type { Collected } from './collected-fields';

/** One payment milestone on a project. */
export type Milestone = ProjectDetail['milestones'][number];

/** Every way a payment can arrive, in the order the method picker shows them. */
export const METHODS = [
  'upi',
  'bank_transfer',
  'cheque',
  'cash',
  'razorpay',
  'bank_disbursement',
] as const;

/** One way a payment can arrive. */
export type Method = (typeof METHODS)[number];

/** Only cash and cheques carry who holds them and the cheque's details. */
export function collectedBody(method: Method, collected: Collected) {
  if (method !== 'cash' && method !== 'cheque') return {};
  return {
    collectedByUserId: collected.collectedByUserId || null,
    ...(method === 'cheque'
      ? {
          chequeNumber: collected.chequeNumber.trim() || null,
          chequeBank: collected.chequeBank.trim() || null,
          chequeDate: collected.chequeDate || null,
        }
      : {}),
  };
}

/** Blank cash and cheque details. */
export const NO_COLLECTED: Collected = {
  collectedByUserId: '',
  chequeNumber: '',
  chequeBank: '',
  chequeDate: '',
};

/** What is still owed on a milestone, in paise. */
export const remaining = (milestone: Milestone) => milestone.amountPaise - milestone.paidPaise;
/** Paise as the rupee text an amount input shows. */
export const toRupees = (paise: number) => String(paise / 100);
/** Typed rupees (commas allowed) as paise; anything unreadable counts as zero. */
export const paiseOf = (text: string) => rupeesToPaise(Number(text.replace(/,/g, '')) || 0);
/** A business customer may deduct TDS when it pays through a bank. */
export const takesTds = (method: Method) =>
  (CUSTOMER_TDS_METHODS as readonly string[]).includes(method);
