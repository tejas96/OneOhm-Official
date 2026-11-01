import { Inject, Injectable } from '@nestjs/common';
import type { BankPayout, PayoutOptions } from '@oneohm/api-contracts';
import { bankPayouts, brandName, payables } from '@oneohm/database';
import { billToPay, maskAccount, payoutOpen, transferMode } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { desc, eq, gt } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { fundAccountFor } from './fund-accounts';
import { payeeOf } from './payees';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway';
import { PROBLEM_TEXT, presentPayout, problemFor } from './payout-rules';

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
  ) {}

  async options(actor: Actor, payableId: string): Promise<PayoutOptions> {
    assertCan(actor, 'finance.view', 'finance.record_payments');
    const [bill] = await this.db.select().from(payables).where(eq(payables.id, payableId)).limit(1);
    if (!bill) throw notFound('That bill');
    const payee = await payeeOf(this.db, payableId);
    const [latest] = await this.db
      .select()
      .from(bankPayouts)
      .where(eq(bankPayouts.payableId, payableId))
      .orderBy(desc(bankPayouts.createdAt))
      .limit(1);
    // The payee gets the bill less TDS (owed to the government) and advances set off.
    const amountPaise = billToPay(bill);
    return {
      mode: this.gateway.mode,
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
      problem: problemFor({
        mode: this.gateway.mode,
        status: bill.status,
        payee,
        amountPaise,
        sending: latest ? payoutOpen(latest.status) : false,
      }),
      amountPaise,
      transferMode: transferMode(amountPaise),
      latest: latest ? presentPayout(latest) : null,
    };
  }

  async send(actor: Actor, payableId: string): Promise<BankPayout> {
    // Money leaves the bank by itself, so this needs the right to approve payments.
    assertCan(actor, 'finance.approve_payments');
    const options = await this.options(actor, payableId);
    if (options.problem) throw conflict(PROBLEM_TEXT[options.problem], options.problem);
    const payee = await payeeOf(this.db, payableId);
    if (!payee?.bank.name || !payee.bank.ifsc || !payee.bank.accountNumber) {
      throw conflict(PROBLEM_TEXT.no_bank_details, 'no_bank_details');
    }
    const bank = {
      name: payee.bank.name,
      ifsc: payee.bank.ifsc,
      accountNumber: payee.bank.accountNumber,
    };
    const fundAccountId = await fundAccountFor(this.db, this.gateway, payee, bank);
    const [row] = await this.db
      .insert(bankPayouts)
      .values({
        payableId,
        provider: this.gateway.provider,
        fundAccountId,
        mode: options.transferMode,
        amountPaise: options.amountPaise,
        accountMasked: maskAccount(bank.accountNumber),
        requestedByUserId: actor.userId,
      })
      .returning()
      .catch((error: unknown) => {
        // Two clicks at once: the database allows one open transfer per bill.
        if (isUniqueViolation(error))
          throw conflict(PROBLEM_TEXT.already_sending, 'already_sending');
        throw error;
      });
    if (!row) throw new Error('Payout insert returned nothing');
    try {
      const created = await this.gateway.createPayout({
        fundAccountId,
        amountPaise: options.amountPaise,
        mode: options.transferMode,
        referenceId: row.id,
        // The company's name from its profile, then the payee (RazorpayX keeps 30 characters).
        narration: `${await brandName(this.db)} ${payee.name}`.trim(),
      });
      await this.db
        .update(bankPayouts)
        .set({ providerPayoutId: created.id, status: created.status, updatedAt: new Date() })
        .where(eq(bankPayouts.id, row.id));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.db
        .update(bankPayouts)
        .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
        .where(eq(bankPayouts.id, row.id));
      throw conflict(`The bank transfer could not be started: ${reason}`, 'payout_failed');
    }
    await recordAudit(this.db, actor.userId, 'payout.sent', 'payable', payableId, {
      payoutId: row.id,
      amountPaise: options.amountPaise,
      to: `${payee.name} ${maskAccount(bank.accountNumber)}`,
      note: `${formatInr(options.amountPaise)} by ${options.transferMode}`,
    });
    const [sent] = await this.db.select().from(bankPayouts).where(eq(bankPayouts.id, row.id));
    if (!sent) throw notFound('That payout');
    return presentPayout(sent);
  }

  async recent(actor: Actor): Promise<BankPayout[]> {
    assertCan(actor, 'finance.view', 'finance.record_payments');
    const since = new Date(Date.now() - 60 * 86_400_000);
    const rows = await this.db
      .select()
      .from(bankPayouts)
      .where(gt(bankPayouts.createdAt, since))
      .orderBy(desc(bankPayouts.createdAt))
      .limit(300);
    return rows.map(presentPayout);
  }
}
