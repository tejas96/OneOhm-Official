import { Inject, Injectable } from '@nestjs/common';
import type { CashPosition, HandledPayment, MoneyDeposit, NewDeposit } from '@oneohm/api-contracts';
import {
  moneyDeposits,
  notify,
  paymentHandling,
  postCashDeposit,
  postChequeCleared,
  projects,
} from '@oneohm/database';
import { CASH_HELD_ALERT_DAYS, canDeposit, canSettleCheque, depositNumber } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { assertNotFuture } from '../../common/dates';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { readHandled } from './cash-handling-read';
import { collectorsOf, readDeposits } from './deposit-read';
import { PaymentReversalService } from './payment-reversal.service';

/** Cash and cheques from the person who collected them to the bank (PRD 3.11). */
@Injectable()
export class CashHandlingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly reversals: PaymentReversalService,
  ) {}

  async position(actor: Actor): Promise<CashPosition> {
    assertCan(actor, 'finance.view');
    const handled = await readHandled(
      this.db,
      inArray(paymentHandling.status, ['in_hand', 'deposited']),
    );
    const open = handled.filter((item) => item.status === 'in_hand' || item.method === 'cheque');
    const cash = open.filter((item) => item.method === 'cash');
    const sum = (items: readonly HandledPayment[]) =>
      items.reduce((total, item) => total + item.amountPaise, 0);
    return {
      cashInHandPaise: sum(cash),
      chequesOpenPaise: sum(open.filter((item) => item.method === 'cheque')),
      collectors: collectorsOf(cash),
      open,
      alertDays: CASH_HELD_ALERT_DAYS,
    };
  }

  async deposits(actor: Actor): Promise<MoneyDeposit[]> {
    assertCan(actor, 'finance.view');
    return readDeposits(this.db);
  }

  async depositItems(actor: Actor, id: string): Promise<HandledPayment[]> {
    assertCan(actor, 'finance.view');
    return readHandled(this.db, eq(paymentHandling.depositId, id));
  }

  async createDeposit(actor: Actor, input: NewDeposit): Promise<MoneyDeposit> {
    assertNotFuture(input.depositedOn, 'depositedOn');
    assertCan(actor, 'finance.record_payments');
    const ids = [...new Set(input.paymentIds)];
    const items = await readHandled(this.db, inArray(paymentHandling.paymentId, ids));
    if (items.length !== ids.length) {
      throw invalid('Some payments cannot go on a deposit.', { paymentIds: 'Pick them again.' });
    }
    const done = items.find((item) => !canDeposit(item.status));
    if (done) {
      throw conflict(
        `${done.receiptNumber ?? done.projectCode} is already deposited.`,
        'deposited',
      );
    }
    if (items.some((item) => item.receivedOn > input.depositedOn)) {
      throw invalid('The deposit date is before some of the money was received.', {
        depositedOn: 'Use the date on the bank slip.',
      });
    }
    const cashPaise = items
      .filter((item) => item.method === 'cash')
      .reduce((total, item) => total + item.amountPaise, 0);
    const chequePaise = items
      .filter((item) => item.method === 'cheque')
      .reduce((total, item) => total + item.amountPaise, 0);
    const id = await this.db.transaction(async (tx) => {
      const prefix = depositNumber(input.depositedOn, 0).slice(0, -4);
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(moneyDeposits)
        .where(like(moneyDeposits.number, `${prefix}%`));
      const number = depositNumber(input.depositedOn, (count?.n ?? 0) + 1);
      const [deposit] = await tx
        .insert(moneyDeposits)
        .values({
          number,
          depositedOn: input.depositedOn,
          bankReference: input.bankReference?.trim() || null,
          cashPaise,
          chequePaise,
          note: input.note?.trim() ?? '',
          depositedByUserId: actor.userId,
        })
        .returning({ id: moneyDeposits.id });
      if (!deposit) throw new Error('Deposit insert returned nothing');
      const moved = await tx
        .update(paymentHandling)
        .set({ status: 'deposited', depositId: deposit.id, updatedAt: new Date() })
        .where(and(inArray(paymentHandling.paymentId, ids), eq(paymentHandling.status, 'in_hand')))
        .returning({ id: paymentHandling.paymentId });
      if (moved.length !== ids.length) throw conflict('Someone deposited some of these just now.');
      await postCashDeposit(
        tx,
        { id: deposit.id, number, depositedOn: input.depositedOn, cashPaise },
        actor.userId,
      );
      await recordAudit(tx, actor.userId, 'deposit.created', 'money_deposit', deposit.id, {
        number,
        cashPaise,
        chequePaise,
        payments: ids.length,
      });
      return deposit.id;
    });
    const created = (await readDeposits(this.db)).find((deposit) => deposit.id === id);
    if (!created) throw notFound('That deposit');
    return created;
  }

  async clearCheque(actor: Actor, paymentId: string, clearedOn: string): Promise<HandledPayment> {
    assertNotFuture(clearedOn, 'clearedOn');
    assertCan(actor, 'finance.record_payments');
    const cheque = await this.openCheque(paymentId);
    if (clearedOn < cheque.receivedOn) {
      throw invalid('A cheque cannot clear before it was received.', {
        clearedOn: 'Check the date.',
      });
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(paymentHandling)
        .set({ status: 'cleared', clearedOn, updatedAt: new Date() })
        .where(eq(paymentHandling.paymentId, paymentId));
      await postChequeCleared(
        tx,
        {
          paymentId,
          projectId: cheque.projectId,
          amountPaise: cheque.amountPaise,
          clearedOn,
          label: `${cheque.projectCode} · cheque ${cheque.chequeNumber ?? ''}`.trim(),
        },
        actor.userId,
      );
      await recordAudit(tx, actor.userId, 'cheque.cleared', 'payment', paymentId, { clearedOn });
    });
    return this.one(paymentId);
  }

  /** The cheque came back unpaid: the payment is reversed and its milestone reopens. */
  async bounceCheque(
    actor: Actor,
    paymentId: string,
    input: { bouncedOn: string; reason: string },
  ): Promise<HandledPayment> {
    assertNotFuture(input.bouncedOn, 'bouncedOn');
    assertCan(actor, 'finance.approve_payments');
    const cheque = await this.openCheque(paymentId);
    const label = `Cheque ${cheque.chequeNumber ?? ''} bounced: ${input.reason}`;
    await this.reversals.reverse(actor, paymentId, label.replace(/\s+/g, ' '));
    await this.db.transaction(async (tx) => {
      await tx
        .update(paymentHandling)
        .set({
          status: 'bounced',
          bouncedOn: input.bouncedOn,
          bounceReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(paymentHandling.paymentId, paymentId));
      const [project] = await tx
        .select({ manager: projects.managerUserId })
        .from(projects)
        .where(eq(projects.id, cheque.projectId));
      if (project?.manager) {
        await notify(
          tx,
          { userId: project.manager },
          {
            kind: 'cheque_bounced',
            title: `Cheque bounced on ${cheque.projectCode}`,
            body: `${formatInr(cheque.amountPaise)} from ${cheque.customer}. The milestone is due again.`,
            subject: { type: 'project', id: cheque.projectId, projectId: cheque.projectId },
            dedupeKey: `cheque_bounced:${paymentId}`,
          },
        );
      }
      await recordAudit(tx, actor.userId, 'cheque.bounced', 'payment', paymentId, input);
    });
    return this.one(paymentId);
  }

  private async openCheque(paymentId: string): Promise<HandledPayment> {
    const cheque = await this.one(paymentId);
    if (!canSettleCheque(cheque.method, cheque.status)) {
      throw conflict('This cheque has already cleared or bounced.', cheque.status);
    }
    return cheque;
  }

  private async one(paymentId: string): Promise<HandledPayment> {
    const [item] = await readHandled(this.db, eq(paymentHandling.paymentId, paymentId));
    if (!item) throw notFound('That cash or cheque payment');
    return item;
  }
}
