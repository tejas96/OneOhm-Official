import { Inject, Injectable } from '@nestjs/common';
import type { CustomerPayLink } from '@oneohm/api-contracts';
import { paymentMilestones, payments, projects } from '@oneohm/database';
import { and, eq, ne, sql } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { PaymentLinksService } from './payment-links.service';

/** What the pay page shows before the customer taps Continue. */
export interface PayPreview {
  readonly amountPaise: number;
  readonly label: string;
}

/**
 * Pay from the customer's side (PRD 5.3) — the app's Pay button and the link in a "payment
 * due" message — even when the team never sent a link. It reuses the open link or makes
 * one for the balance; the customer is already paying, so no extra message is sent.
 */
@Injectable()
export class CustomerPayService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly links: PaymentLinksService,
  ) {}

  /** What is left to pay, with the same refusals as `pay`, and nothing made at the gateway. */
  async preview(customerId: string, milestoneId: string): Promise<PayPreview> {
    const milestone = await this.own(customerId, milestoneId);
    if (this.links.setup().mode === 'off')
      throw conflict('Online payments are not set up yet.', 'off');
    if (milestone.status === 'paid') throw conflict('Nothing is left to pay.', 'paid');
    if (milestone.status !== 'due' && milestone.status !== 'partly_paid')
      throw conflict('This payment is not due yet.', 'not_due');
    const [paid] = await this.db
      .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
      .from(payments)
      .where(eq(payments.milestoneId, milestoneId));
    const amountPaise = milestone.amountPaise - Number(paid?.total ?? 0);
    if (amountPaise <= 0) throw conflict('Nothing is left to pay.', 'paid');
    return { amountPaise, label: milestone.label };
  }

  async pay(customerId: string, milestoneId: string): Promise<CustomerPayLink> {
    await this.own(customerId, milestoneId);
    // Two quick taps make one link: the second waits, then finds the first one open.
    const link = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('customer_pay'), hashtext(${milestoneId}))`,
      );
      return this.links.create({ userId: null }, milestoneId, { tell: false });
    });
    return { url: link.url, amountPaise: link.amountPaise - link.paidPaise, sandbox: link.sandbox };
  }

  /** The customer's own milestone, paid by them (not the bank's share). */
  private async own(customerId: string, milestoneId: string) {
    const [row] = await this.db
      .select({
        payer: paymentMilestones.payer,
        status: paymentMilestones.status,
        amountPaise: paymentMilestones.amountPaise,
        label: paymentMilestones.label,
      })
      .from(paymentMilestones)
      .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
      .where(
        and(
          eq(paymentMilestones.id, milestoneId),
          eq(projects.customerId, customerId),
          ne(projects.status, 'cancelled'),
        ),
      );
    // Another customer's milestone is simply not found.
    if (!row) throw notFound('That payment');
    if (row.payer !== 'customer')
      throw conflict('The bank pays this share directly.', 'bank_share');
    return row;
  }
}
