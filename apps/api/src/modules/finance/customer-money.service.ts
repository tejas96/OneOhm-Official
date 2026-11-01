import { Inject, Injectable } from '@nestjs/common';
import type { CustomerMoneyEntry } from '@oneohm/api-contracts';
import {
  customerCredits,
  customerRefunds,
  paymentMilestones,
  payments,
  postCustomerRefund,
  projectActivities,
  projects,
  type Transaction,
} from '@oneohm/database';
import type { RefundMethod } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { FinanceService } from '../projects/finance.service';
import { creditBalance, customerMoneyEntries } from './customer-money-read';
import { reopenMilestone } from './payment-reversal.service';

export interface NewRefund {
  readonly milestoneId?: string | null | undefined;
  readonly amountPaise: number;
  readonly method: RefundMethod;
  readonly paidOn: string;
  readonly reference?: string | null | undefined;
  readonly reason: string;
}

const tooMuch = (left: number, where: string, message = 'That is more than can be refunded.') =>
  invalid(message, { amountPaise: `At most ${formatInr(Math.max(0, left))} ${where}.` });
const MORE_THAN_CREDIT = 'That is more than the customer has in credit.';

/**
 * Customer credit and refunds (PRD 3.11). The double-entry design is described in
 * `customer-credit-postings.ts` in the domain package: credit is a liability (2110),
 * applying it is a payment row paid from credit, refunds are money out.
 */
@Injectable()
export class CustomerMoneyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly finance: FinanceService,
  ) {}

  credit(projectId: string): Promise<number> {
    return creditBalance(this.db, projectId);
  }

  entries(filter: { projectId?: string; limit: number }): Promise<CustomerMoneyEntry[]> {
    return customerMoneyEntries(this.db, filter);
  }

  async refund(actor: Actor, projectId: string, input: NewRefund): Promise<CustomerMoneyEntry> {
    const id = await this.db.transaction(async (tx) => {
      await this.lockProject(tx, projectId);
      const release = input.milestoneId
        ? await this.releaseFromMilestone(tx, actor, projectId, input.milestoneId, input)
        : await this.checkCredit(tx, projectId, input.amountPaise);
      const [refund] = await tx
        .insert(customerRefunds)
        .values({
          projectId,
          milestoneId: input.milestoneId ?? null,
          releasePaymentId: release,
          amountPaise: input.amountPaise,
          method: input.method,
          paidOn: input.paidOn,
          reference: input.reference ?? null,
          reason: input.reason,
          recordedByUserId: actor.userId,
        })
        .returning({ id: customerRefunds.id });
      if (!refund) throw new Error('Refund insert returned nothing.');
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'payment',
        message: `${formatInr(input.amountPaise)} refunded to the customer: ${input.reason}`,
        userId: actor.userId,
      });
      await postCustomerRefund(tx, refund.id, actor.userId);
      await recordAudit(tx, actor.userId, 'refund.recorded', 'project', projectId, {
        refundId: refund.id,
        amountPaise: input.amountPaise,
        method: input.method,
        milestoneId: input.milestoneId ?? null,
      });
      return refund.id;
    });
    return this.entry(projectId, id);
  }

  /** Pays a milestone out of credit: a normal payment with a receipt, paid from credit. */
  async applyCredit(
    actor: Actor,
    projectId: string,
    input: { readonly milestoneId: string; readonly amountPaise: number },
  ): Promise<CustomerMoneyEntry> {
    const held = await creditBalance(this.db, projectId);
    if (input.amountPaise > held) {
      throw tooMuch(held, 'is held as credit on this project', MORE_THAN_CREDIT);
    }
    const [latest] = await this.db
      .select({ method: customerCredits.method, reference: customerCredits.reference })
      .from(customerCredits)
      .where(eq(customerCredits.projectId, projectId))
      .orderBy(desc(customerCredits.createdAt))
      .limit(1);
    const id = await this.finance.recordPayment(
      actor,
      projectId,
      {
        milestoneId: input.milestoneId,
        amountPaise: input.amountPaise,
        method: latest?.method ?? 'razorpay',
        receivedOn: todayIn('Asia/Kolkata'),
        reference: `From credit${latest?.reference ? ` (${latest.reference})` : ''}`,
        paidFromCredit: true,
      },
      async (tx) => {
        // Re-checked inside the transaction, after the new row, so two applies cannot overspend.
        if ((await creditBalance(tx, projectId)) < 0) {
          throw tooMuch(held, 'is held as credit on this project', MORE_THAN_CREDIT);
        }
      },
    );
    return this.entry(projectId, id);
  }

  private async lockProject(tx: Transaction, projectId: string): Promise<void> {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('update')
      .limit(1);
    if (!project) throw notFound('That project');
  }

  private async checkCredit(tx: Transaction, projectId: string, amountPaise: number) {
    const held = await creditBalance(tx, projectId);
    if (amountPaise > held) throw tooMuch(held, 'is held as credit on this project');
    return null;
  }

  /**
   * Money paid towards a milestone goes back: a negative payment row reopens the
   * milestone (like a reversal, but the money really left), and financial closure lifts.
   */
  private async releaseFromMilestone(
    tx: Transaction,
    actor: Actor,
    projectId: string,
    milestoneId: string,
    input: NewRefund,
  ): Promise<string> {
    const [milestone] = await tx
      .select()
      .from(paymentMilestones)
      .where(and(eq(paymentMilestones.id, milestoneId), eq(paymentMilestones.projectId, projectId)))
      .limit(1);
    if (!milestone) throw notFound('That payment milestone');
    if (milestone.payer === 'bank') {
      throw invalid('The bank’s share goes back to the bank, not to the customer.', {
        milestoneId: 'Choose one of the customer’s milestones.',
      });
    }
    const [paid] = await tx
      .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
      .from(payments)
      .where(eq(payments.milestoneId, milestoneId));
    const left = Number(paid?.total ?? 0);
    if (input.amountPaise > left) throw tooMuch(left, `was paid towards ${milestone.label}`);
    const [row] = await tx
      .insert(payments)
      .values({
        projectId,
        milestoneId,
        payer: milestone.payer,
        method: input.method,
        amountPaise: -input.amountPaise,
        receivedOn: input.paidOn,
        reference: `Refund${input.reference ? ` · ${input.reference}` : ''}`,
        recordedByUserId: actor.userId,
      })
      .returning({ id: payments.id });
    if (!row) throw new Error('Refund release insert returned nothing.');
    await reopenMilestone(tx, milestoneId);
    await tx
      .update(projects)
      .set({ financiallyClosedAt: null, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    return row.id;
  }

  private async entry(projectId: string, id: string): Promise<CustomerMoneyEntry> {
    const entries = await customerMoneyEntries(this.db, { projectId, limit: 500 });
    const found = entries.find((entry) => entry.id === id);
    if (!found) throw notFound('That entry');
    return found;
  }
}
