import type { PayoutOptions } from '@oneohm/api-contracts';
import { bankPayouts, payables, readBusinessSetting, users } from '@oneohm/database';
import {
  feeEstimate,
  leftToPay,
  maskAccount,
  needsSecondPerson,
  payoutOpen,
  secondPersonMet,
  transferMode,
} from '@oneohm/domain';
import { desc, eq } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import { holdMessage, payeeHeld } from './bank-hold';
import { payeeOf } from './payees';
import type { PayoutGateway } from './payout-gateway';
import { secondPersonMessage } from './payout-people';
import { openRequestOf, presentRequest } from './payout-requests';
import { PROBLEM_TEXT, presentPayout, problemFor } from './payout-rules';

/**
 * Everything the Pay dialog needs about one bill: who gets the money, whether a transfer
 * can go now and why not, the open ask to send, the 24-hour bank hold and the two-people
 * rule, all worked out for the person looking.
 */
export async function payoutOptionsFor(
  db: Database,
  gateway: PayoutGateway,
  actor: Actor,
  payableId: string,
): Promise<PayoutOptions> {
  const [bill] = await db.select().from(payables).where(eq(payables.id, payableId)).limit(1);
  if (!bill) throw notFound('That bill');
  const payee = await payeeOf(db, payableId);
  const [latest] = await db
    .select()
    .from(bankPayouts)
    .where(eq(bankPayouts.payableId, payableId))
    .orderBy(desc(bankPayouts.createdAt))
    .limit(1);
  // The payee gets the bill less TDS (owed to the government), advances set off and
  // anything already paid. `amountPaise` stays as the full left amount, the default to send.
  const amountPaise = leftToPay(bill);
  const held = payee ? payeeHeld(payee) : false;
  const problem = problemFor({
    mode: gateway.mode,
    status: bill.status,
    payee,
    amountPaise,
    sending: latest ? payoutOpen(latest.status) : false,
    held,
  });
  const open = await openRequestOf(db, payableId);
  const mayApprove = can(actor, 'finance.approve_payments');
  const policy = await readBusinessSetting(db, 'approvals');
  const needed = needsSecondPerson(amountPaise, policy.secondPersonAbovePaise);
  const met = secondPersonMet({
    senderId: actor.userId,
    approvedByUserId: bill.approvedByUserId,
    askedByUserId: open?.requestedByUserId ?? null,
  });
  const blocked = needed && !met;
  const [changer] =
    payee?.hold.changedByUserId && held
      ? await db
          .select({ name: users.fullName })
          .from(users)
          .where(eq(users.id, payee.hold.changedByUserId))
      : [];
  const fee = (await readBusinessSetting(db, 'payments')).razorpayxFeePaise;
  const holdText = payee && held ? await holdMessage(db, payee) : null;
  return {
    mode: gateway.mode,
    payee: payee
      ? {
          kind: payee.kind,
          id: payee.id,
          name: payee.name,
          accountName: payee.bank.name ?? null,
          accountMasked: payee.bank.accountNumber ? maskAccount(payee.bank.accountNumber) : null,
          ifsc: payee.bank.ifsc ?? null,
        }
      : null,
    problem,
    problemText:
      problem === 'bank_on_hold' && holdText ? holdText : problem ? PROBLEM_TEXT[problem] : null,
    leftPaise: amountPaise,
    amountPaise,
    transferMode: transferMode(amountPaise),
    latest: latest ? presentPayout(latest, bill.partyName) : null,
    request: open ? await presentRequest(db, open, actor.userId) : null,
    canSend: mayApprove && problem === null && !blocked,
    canAsk:
      can(actor, 'finance.record_payments') && !mayApprove && problem === null && open === null,
    hold:
      payee && held && payee.hold.heldUntil && holdText
        ? {
            until: payee.hold.heldUntil.toISOString(),
            changedByName: changer?.name ?? null,
            canRelease: mayApprove && payee.hold.changedByUserId !== actor.userId,
            text: holdText,
          }
        : null,
    feeEstimate: feeEstimate(fee),
    secondPerson: {
      needed,
      met,
      text:
        needed && !met && mayApprove
          ? await secondPersonMessage(db, policy.secondPersonAbovePaise, actor.userId)
          : null,
    },
  };
}
