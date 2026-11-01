/**
 * Purchase requests (PRD 3.10): anyone who works with stock or projects asks for
 * material; procurement approves or rejects with a note, then turns an approved
 * request into a draft purchase order.
 */
export const PURCHASE_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'ordered',
  'cancelled',
] as const;
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];

export type PurchaseRequestStep = 'approve' | 'reject' | 'order' | 'cancel';

const FROM: Readonly<Record<PurchaseRequestStep, readonly PurchaseRequestStatus[]>> = {
  approve: ['pending'],
  reject: ['pending'],
  order: ['approved'],
  cancel: ['pending', 'approved'],
};

/** Whether a request in `status` can take `step`. */
export function canStepRequest(status: PurchaseRequestStatus, step: PurchaseRequestStep): boolean {
  return FROM[step].includes(status);
}

/** The earliest need-by date on a request: what procurement sorts and chases by. */
export function earliestNeed(lines: readonly { readonly neededBy: string }[]): string | null {
  let first: string | null = null;
  for (const line of lines) if (first === null || line.neededBy < first) first = line.neededBy;
  return first;
}
