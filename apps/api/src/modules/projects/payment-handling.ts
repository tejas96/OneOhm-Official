import { paymentHandling, type Transaction } from '@oneohm/database';
import { isHandledMethod } from '@oneohm/domain';
import { invalid } from '../../common/http/errors';

/** Cash or cheque details captured when the payment is recorded (PRD 3.11). */
export interface CollectedMoney {
  readonly method: string;
  readonly paidFromCredit?: boolean | undefined;
  readonly collectedByUserId?: string | null | undefined;
  readonly chequeNumber?: string | null | undefined;
  readonly chequeBank?: string | null | undefined;
  readonly chequeDate?: string | null | undefined;
}

/** A cheque needs its number, so it can be matched on the bank statement. */
export function checkCollected(input: CollectedMoney): void {
  if (input.method === 'cheque' && !input.chequeNumber?.trim()) {
    throw invalid('Enter the cheque number.', { chequeNumber: 'Required for a cheque.' });
  }
}

/**
 * Starts tracking cash or a cheque from the person who collected it until it is in
 * the bank. Other methods (bank transfer, UPI, online) arrive in the bank directly.
 */
export async function recordHandling(
  tx: Transaction,
  paymentId: string,
  input: CollectedMoney,
  recordedByUserId: string | null,
): Promise<void> {
  if (!isHandledMethod(input.method) || input.paidFromCredit) return;
  const cheque = input.method === 'cheque';
  await tx.insert(paymentHandling).values({
    paymentId,
    collectedByUserId: input.collectedByUserId ?? recordedByUserId,
    chequeNumber: cheque ? (input.chequeNumber?.trim() ?? null) : null,
    chequeBank: cheque ? (input.chequeBank?.trim() ?? null) : null,
    chequeDate: cheque ? (input.chequeDate ?? null) : null,
  });
}
