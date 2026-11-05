import { Inject, Injectable } from '@nestjs/common';
import type { BankPayout, PayoutOptions, PayoutSetup } from '@oneohm/api-contracts';
import { bankPayouts, brandName, payables, readBusinessSetting } from '@oneohm/database';
import {
  isLowBalanceFailure,
  maskAccount,
  partPaymentProblem,
  secondPersonMissing,
  transferMode,
} from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { holdMessage, payeeHeld } from './bank-hold';
import { fundAccountFor } from './fund-accounts';
import { payeeOf } from './payees';
import { billOf, tellFinance } from './payout-alerts';
import { isLowBalance, PayoutRejected, rejectionText } from './payout-errors';
import { applyPayoutEvent } from './payout-events';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway';
import { payoutOptionsFor } from './payout-options';
import { approverOf, secondPersonMessage } from './payout-people';
import { type PracticeOutcome, practiceOutcome } from './payout-practice';
import { closeRequest, openRequestOf } from './payout-requests';
import { PROBLEM_TEXT, presentPayout } from './payout-rules';
import { payoutSetupFor } from './payout-setup';
import { PayoutSyncService } from './payout-sync.service';

const isUniqueViolation = (error: unknown): boolean => {
  const code = (value: unknown) =>
    typeof value === 'object' && value !== null ? (value as { code?: string }).code : undefined;
  return code(error) === '23505' || code((error as { cause?: unknown })?.cause) === '23505';
};

/** Paying approved bills straight to the payee's bank through RazorpayX (PRD 3.11). */
@Injectable()
export class BankPayoutsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYOUT_GATEWAY) private readonly gateway: PayoutGateway,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly sync: PayoutSyncService,
  ) {}

  options(actor: Actor, payableId: string): Promise<PayoutOptions> {
    assertCan(actor, 'finance.view', 'finance.record_payments');
    return payoutOptionsFor(this.db, this.gateway, actor, payableId);
  }

  /** Sends all that is left on the bill, or a part of it when `partPaise` is given. */
  async send(actor: Actor, payableId: string, partPaise?: number): Promise<BankPayout> {
    // Money leaves the bank by itself, so this needs the right to approve payments.
    assertCan(actor, 'finance.approve_payments');
    const options = await this.options(actor, payableId);
    if (options.problem) {
      throw conflict(options.problemText ?? PROBLEM_TEXT[options.problem], options.problem);
    }
    const sendPaise = partPaise ?? options.leftPaise;
    const tooMuchOrLittle = partPaymentProblem(sendPaise, options.leftPaise);
    if (tooMuchOrLittle) throw invalid(tooMuchOrLittle, { amountPaise: tooMuchOrLittle });
    // IMPS or NEFT is chosen for the amount actually sent, never for the whole bill.
    const mode = transferMode(sendPaise);
    const payee = await payeeOf(this.db, payableId);
    // Checked again on the payee as read now, so details changed a moment ago cannot slip by.
    if (payee && payeeHeld(payee)) {
      throw conflict(await holdMessage(this.db, payee), 'bank_on_hold');
    }
    const request = await openRequestOf(this.db, payableId);
    await this.assertSecondPerson(actor, payableId, sendPaise, request?.requestedByUserId ?? null);
    if (!payee?.bank.name || !payee.bank.ifsc || !payee.bank.accountNumber) {
      throw conflict(PROBLEM_TEXT.no_bank_details, 'no_bank_details');
    }
    const bank = {
      name: payee.bank.name,
      ifsc: payee.bank.ifsc,
      accountNumber: payee.bank.accountNumber,
    };
    const fundAccountId = await fundAccountFor(this.db, this.gateway, payee, bank).catch(
      (error: unknown) => {
        // Nothing has been sent yet, so say plainly what went wrong.
        const why = error instanceof Error ? error.message : String(error);
        throw conflict(
          `Could not set up ${payee.name} with RazorpayX: ${why}. Nothing was sent.`,
          'payee_setup_failed',
        );
      },
    );
    const [row] = await this.db
      .insert(bankPayouts)
      .values({
        payableId,
        provider: this.gateway.provider,
        fundAccountId,
        mode: mode,
        amountPaise: sendPaise,
        accountMasked: maskAccount(bank.accountNumber),
        requestedByUserId: actor.userId,
        payoutRequestId: request?.id ?? null,
        askedByUserId: request?.requestedByUserId ?? null,
      })
      .returning()
      .catch((error: unknown) => {
        // Two clicks at once: the database allows one open transfer per bill.
        if (isUniqueViolation(error))
          throw conflict(PROBLEM_TEXT.already_sending, 'already_sending');
        throw error;
      });
    if (!row) throw new Error('Payout insert returned nothing');
    const to = `${payee.name} ${maskAccount(bank.accountNumber)}`;
    let created: Awaited<ReturnType<PayoutGateway['createPayout']>>;
    try {
      created = await this.gateway.createPayout({
        fundAccountId,
        amountPaise: sendPaise,
        mode: mode,
        referenceId: row.id,
        // The company's name from its profile, then the payee (RazorpayX keeps 30 characters).
        narration: `${await brandName(this.db)} ${payee.name}`.trim(),
      });
    } catch (error) {
      if (error instanceof PayoutRejected) {
        // RazorpayX said no, so nothing was sent and the bill can be paid again.
        const failureCode = isLowBalance(error) ? 'low_balance' : 'rejected';
        const reason = rejectionText(error);
        await this.db
          .update(bankPayouts)
          .set({ status: 'failed', failureReason: reason, failureCode, updatedAt: new Date() })
          .where(eq(bankPayouts.id, row.id));
        await recordAudit(this.db, actor.userId, 'payout.send_failed', 'payable', payableId, {
          payoutId: row.id,
          amountPaise: sendPaise,
          to,
          code: failureCode,
          note: error.description,
        });
        throw conflict(reason, isLowBalanceFailure(failureCode) ? 'low_balance' : 'payout_failed');
      }
      // Timeout, network or server error: RazorpayX may have made the payout. Leave it
      // open (the one-open rule blocks a second send); the check settles it by reference.
      await recordAudit(this.db, actor.userId, 'payout.unsure', 'payable', payableId, {
        payoutId: row.id,
        amountPaise: sendPaise,
        to,
        note: error instanceof Error ? error.message : String(error),
      });
      await tellFinance(
        this.db,
        await billOf(this.db, payableId),
        {
          kind: 'payout_unsure',
          title: `Checking the bank transfer to ${payee.name} with RazorpayX`,
          body: `${formatInr(sendPaise)}: RazorpayX did not answer. We are checking, so do not pay again yet.`,
          dedupeKey: `payout_unsure:${row.id}`,
        },
        { exceptUserId: actor.userId },
      );
      // The transfer may exist, so the ask is answered; the check settles the rest.
      if (request) await closeRequest(this.db, request.id, 'sent', actor.userId);
      return this.presentOne(row.id);
    }
    // The money is on its way, so the ask to send is answered.
    if (request) await closeRequest(this.db, request.id, 'sent', actor.userId);
    // The webhook may have beaten us here, so only fill in the id and never step status back.
    await this.db
      .update(bankPayouts)
      .set({ providerPayoutId: created.id, updatedAt: new Date() })
      .where(and(eq(bankPayouts.id, row.id), isNull(bankPayouts.providerPayoutId)));
    if (created.status !== 'queued')
      await applyPayoutEvent(this.db, {
        payload: { payout: { entity: { id: created.id, status: created.status } } },
      });
    await recordAudit(this.db, actor.userId, 'payout.sent', 'payable', payableId, {
      payoutId: row.id,
      amountPaise: sendPaise,
      to,
      note: `${formatInr(sendPaise)} by ${mode}`,
      askedByUserId: request?.requestedByUserId ?? null,
      billApprovedByUserId: await approverOf(this.db, payableId),
    });
    return this.presentOne(row.id);
  }

  /** Above the limit in Settings, someone besides the sender must have approved or asked. */
  private async assertSecondPerson(
    actor: Actor,
    payableId: string,
    sendPaise: number,
    askedByUserId: string | null,
  ): Promise<void> {
    const { secondPersonAbovePaise: limit } = await readBusinessSetting(this.db, 'approvals');
    const missing = secondPersonMissing({
      amountPaise: sendPaise,
      limitPaise: limit,
      senderId: actor.userId,
      approvedByUserId: await approverOf(this.db, payableId),
      askedByUserId,
    });
    if (!missing) return;
    throw conflict(await secondPersonMessage(this.db, limit, actor.userId), 'second_person_needed');
  }

  private async presentOne(id: string): Promise<BankPayout> {
    const [sent] = await this.db
      .select({ payout: bankPayouts, payeeName: payables.partyName })
      .from(bankPayouts)
      .innerJoin(payables, eq(payables.id, bankPayouts.payableId))
      .where(eq(bankPayouts.id, id));
    if (!sent) throw notFound('That payout');
    return presentPayout(sent.payout, sent.payeeName);
  }

  /** The RazorpayX setup check: what is set (never the values) and how the checks are going. */
  setup(actor: Actor): Promise<PayoutSetup> {
    assertCan(actor, 'finance.approve_payments', 'finance.view');
    return payoutSetupFor(this.db, this.env, this.gateway, this.sync.lastRunAt);
  }

  /** Ends a practice payout as a real webhook would (practice mode only). */
  practice(actor: Actor, payoutId: string, outcome: PracticeOutcome): Promise<BankPayout> {
    assertCan(actor, 'finance.approve_payments');
    return practiceOutcome(this.db, this.gateway, actor, payoutId, outcome);
  }

  async recent(actor: Actor): Promise<BankPayout[]> {
    assertCan(actor, 'finance.view', 'finance.record_payments');
    const since = new Date(Date.now() - 60 * 86_400_000);
    const rows = await this.db
      .select({ payout: bankPayouts, payeeName: payables.partyName })
      .from(bankPayouts)
      .innerJoin(payables, eq(payables.id, bankPayouts.payableId))
      .where(gt(bankPayouts.createdAt, since))
      .orderBy(desc(bankPayouts.createdAt))
      .limit(300);
    return rows.map((row) => presentPayout(row.payout, row.payeeName));
  }
}
