import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { GatewaySettlement, OnlinePaymentsSetup, PaymentLink } from '@oneohm/api-contracts';
import {
  customers,
  gatewaySettlements,
  paymentLinks,
  paymentMilestones,
  payments,
  projects,
  queueCustomerMessage,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';
import { openLinksFor } from './open-links';
import { paySigningSecret, signPayToken } from './pay-token';
import { presentLink } from './present-link';

/** Links for what customers still owe, sent on WhatsApp and shown in their app. */
@Injectable()
export class PaymentLinksService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  setup(): OnlinePaymentsSetup {
    return { mode: this.gateway.mode, linkDays: this.env.PAYMENT_LINK_DAYS };
  }

  /** Returns the open link when there is one; otherwise makes one for what is left. */
  /** `actor` is null-user when the WhatsApp assistant asks on the customer's behalf. */
  /** `tell: false` when the customer is already paying (the app's Pay button): no message. */
  async create(
    actor: { readonly userId: string | null },
    milestoneId: string,
    options: { readonly tell?: boolean } = {},
  ): Promise<PaymentLink> {
    if (this.gateway.mode === 'off')
      throw conflict('Online payments are not set up yet. Add the Razorpay keys.', 'off');
    const [row] = await this.db
      .select({ milestone: paymentMilestones, project: projects, customer: customers })
      .from(paymentMilestones)
      .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(eq(paymentMilestones.id, milestoneId))
      .limit(1);
    if (!row) throw notFound('That payment milestone');
    const { milestone, project, customer } = row;
    if (milestone.payer !== 'customer')
      throw invalid('The bank share is claimed from the bank, not paid by link.', {});
    if (milestone.status === 'paid')
      throw conflict('Nothing is left to pay on this milestone.', 'paid');
    if (milestone.status !== 'due' && milestone.status !== 'partly_paid')
      throw conflict('Links are sent once a milestone is due and not yet paid.', 'not_due');
    const open = (await openLinksFor(this.db, [milestoneId])).get(milestoneId);
    if (open) return this.one(open.id);
    const [paid] = await this.db
      .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
      .from(payments)
      .where(eq(payments.milestoneId, milestoneId));
    const owed = milestone.amountPaise - Number(paid?.total ?? 0);
    if (owed <= 0) throw conflict('Nothing is left to pay on this milestone.', 'paid');
    const referenceId = `OH${randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + this.env.PAYMENT_LINK_DAYS * 86_400_000);
    const created = await this.gateway.create({
      amountPaise: owed,
      referenceId,
      description: `${project.code} · ${milestone.label}`,
      customer: { name: customer.name, phone: customer.phoneE164, email: customer.email },
      expiresAt,
      notes: { milestoneId, projectCode: project.code },
    });
    const id = await this.db.transaction(async (tx) => {
      const [link] = await tx
        .insert(paymentLinks)
        .values({
          milestoneId,
          projectId: project.id,
          provider: this.gateway.provider,
          providerLinkId: created.providerLinkId,
          referenceId,
          url: created.url,
          amountPaise: owed,
          expiresAt,
          createdByUserId: actor.userId,
        })
        .returning({ id: paymentLinks.id });
      if (!link) throw new Error('Link insert returned nothing.');
      if (options.tell !== false)
        await queueCustomerMessage(
          tx,
          customer.phoneE164,
          'payment_link',
          {
            customer: customer.name,
            amount: formatInr(owed),
            milestone: milestone.label,
            project: project.code,
            link: created.url,
            payToken: signPayToken(paySigningSecret(this.env), {
              milestoneId,
              customerId: project.customerId,
              exp: Math.floor(expiresAt.getTime() / 1000),
            }),
          },
          `payment_link:${link.id}`,
        );
      await recordAudit(tx, actor.userId, 'payment_link.created', 'project', project.id, {
        milestoneId,
        amountPaise: owed,
      });
      return link.id;
    });
    return this.one(id);
  }

  async cancel(actor: Actor, id: string): Promise<PaymentLink> {
    const link = await this.one(id);
    if (link.status !== 'created' && link.status !== 'partly_paid')
      throw conflict('This link is already closed.', 'closed');
    const [row] = await this.db
      .select({ providerLinkId: paymentLinks.providerLinkId })
      .from(paymentLinks)
      .where(eq(paymentLinks.id, id));
    if (row) await this.gateway.cancel(row.providerLinkId);
    await this.db
      .update(paymentLinks)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentLinks.id, id));
    await recordAudit(this.db, actor.userId, 'payment_link.cancelled', 'project', link.projectId);
    return this.one(id);
  }

  async settlements(): Promise<GatewaySettlement[]> {
    const rows = await this.db
      .select()
      .from(gatewaySettlements)
      .orderBy(desc(gatewaySettlements.settledOn))
      .limit(100);
    return rows.map((row) => ({
      id: row.id,
      providerSettlementId: row.providerSettlementId,
      amountPaise: row.amountPaise,
      feesPaise: row.feesPaise,
      taxPaise: row.taxPaise,
      utr: row.utr,
      settledOn: row.settledOn,
    }));
  }

  async one(id: string): Promise<PaymentLink> {
    const [row] = await this.db.select().from(paymentLinks).where(eq(paymentLinks.id, id));
    if (!row) throw notFound('That payment link');
    return presentLink(row);
  }
}
