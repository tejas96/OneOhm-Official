import { bankPayouts, payables } from '@oneohm/database';
import { leftToPay, partPaymentProblem } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import { PROBLEM_TEXT } from './payout-rules';

const isUniqueViolation = (error: unknown): boolean => {
  const code = (value: unknown) =>
    typeof value === 'object' && value !== null ? (value as { code?: string }).code : undefined;
  return code(error) === '23505' || code((error as { cause?: unknown })?.cause) === '23505';
};

export interface PayoutDraft {
  readonly fundAccountId: string;
  readonly mode: string;
  readonly accountMasked: string;
  readonly requestId: string | null;
  readonly askedBy: string | null;
}

/**
 * Locks the bill (`SELECT ... FOR UPDATE`, the lock a void takes too), checks it again as it
 * is now (still approved, nothing open, the amount still left) and saves the payout row as
 * 'queued' before RazorpayX is called. A void then either ran first (this refuses) or sees
 * the row and refuses itself; a crash after the call leaves a row the check settles by
 * reference.
 */
export function reservePayout(
  db: Database,
  provider: string,
  actor: Actor,
  payableId: string,
  sendPaise: number,
  draft: PayoutDraft,
): Promise<typeof bankPayouts.$inferSelect> {
  return db.transaction(async (tx) => {
    const [bill] = await tx
      .select()
      .from(payables)
      .where(eq(payables.id, payableId))
      .for('update')
      .limit(1);
    if (!bill) throw notFound('That bill');
    if (bill.status !== 'approved') throw conflict(PROBLEM_TEXT.not_approved, 'not_approved');
    const [open] = await tx
      .select({ id: bankPayouts.id })
      .from(bankPayouts)
      .where(
        and(
          eq(bankPayouts.payableId, payableId),
          inArray(bankPayouts.status, ['queued', 'pending', 'processing']),
        ),
      )
      .limit(1);
    if (open) throw conflict(PROBLEM_TEXT.already_sending, 'already_sending');
    const problem = partPaymentProblem(sendPaise, leftToPay(bill));
    if (problem) throw invalid(problem, { amountPaise: problem });
    const [created] = await tx
      .insert(bankPayouts)
      .values({
        payableId,
        provider,
        fundAccountId: draft.fundAccountId,
        mode: draft.mode,
        amountPaise: sendPaise,
        accountMasked: draft.accountMasked,
        requestedByUserId: actor.userId,
        payoutRequestId: draft.requestId,
        askedByUserId: draft.askedBy,
      })
      .returning()
      .catch((error: unknown) => {
        // Two clicks at once: the database allows one open transfer per bill.
        if (isUniqueViolation(error))
          throw conflict(PROBLEM_TEXT.already_sending, 'already_sending');
        throw error;
      });
    if (!created) throw new Error('Payout insert returned nothing');
    return created;
  });
}
