import { Inject, Injectable } from '@nestjs/common';
import type { CustomerPayLink } from '@oneohm/api-contracts';
import { paymentMilestones, projects } from '@oneohm/database';
import { and, eq, ne, sql } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { PaymentLinksService } from './payment-links.service';

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

  async pay(customerId: string, milestoneId: string): Promise<CustomerPayLink> {
    const [row] = await this.db
      .select({ payer: paymentMilestones.payer })
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
    // Two quick taps make one link: the second waits, then finds the first one open.
    const link = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('customer_pay'), hashtext(${milestoneId}))`,
      );
      return this.links.create({ userId: null }, milestoneId, { tell: false });
    });
    return { url: link.url, amountPaise: link.amountPaise - link.paidPaise, sandbox: link.sandbox };
  }
}
