import { Inject, Injectable } from '@nestjs/common';
import {
  customerCredits,
  gatewaySettlements,
  notifyHolders,
  paymentLinks,
  paymentMilestones,
  payments,
  postSettlement,
  projects,
  type Transaction,
} from '@oneohm/database';
import { formatInr, todayIn } from '@oneohm/shared';
import { eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { recordGatewayExcess } from '../finance/customer-credit-excess';
import { FinanceService } from '../projects/finance.service';
import { sendFreshLinkAfterExpiry } from './payment-follow-ups';

export interface GatewayPayment {
  readonly providerLinkId: string;
  readonly gatewayPaymentId: string;
  readonly amountPaise: number;
  readonly feePaise: number;
  readonly paidAt: Date;
}

export interface GatewayPayout {
  readonly provider: string;
  readonly providerSettlementId: string;
  readonly amountPaise: number;
  readonly feesPaise: number;
  readonly taxPaise: number;
  readonly utr: string | null;
  readonly settledAt: Date;
}

/**
 * Turns gateway news into OneOhm records, each exactly once: a paid link becomes a
 * payment with its receipt, ledger entry and fee; a payout moves money to the bank.
 */
@Injectable()
export class GatewayPaymentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly finance: FinanceService,
  ) {}

  /**
   * One transaction with the link row locked, so a webhook and the link check reporting
   * the same payment at once record it once; the link's status is brought up to date on
   * every path, a repeat included.
   */
  async recordLinkPayment(paid: GatewayPayment): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [link] = await tx
        .select({ link: paymentLinks, code: projects.code, label: paymentMilestones.label })
        .from(paymentLinks)
        .innerJoin(projects, eq(projects.id, paymentLinks.projectId))
        .innerJoin(paymentMilestones, eq(paymentMilestones.id, paymentLinks.milestoneId))
        .where(eq(paymentLinks.providerLinkId, paid.providerLinkId))
        .limit(1)
        .for('update', { of: paymentLinks });
      if (!link) return 'unknown link';
      if (await this.alreadyRecorded(tx, paid.gatewayPaymentId)) {
        await this.settleLinkStatus(tx, link.link);
        return 'already recorded';
      }
      const milestone = link.link.milestoneId;
      // Two plain queries: inside a correlated subquery Drizzle prints the milestone's
      // id as a bare "id", which would bind to payments.id and ignore earlier payments.
      const [owed] = await tx
        .select({ amount: paymentMilestones.amountPaise })
        .from(paymentMilestones)
        .where(eq(paymentMilestones.id, milestone));
      const [paidSoFar] = await tx
        .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
        .from(payments)
        .where(eq(payments.milestoneId, milestone));
      const left = Math.max(0, (owed?.amount ?? 0) - Number(paidSoFar?.total ?? 0));
      const recorded = Math.min(left, paid.amountPaise);
      if (recorded > 0)
        await this.finance.recordPayment(
          { userId: null },
          link.link.projectId,
          {
            milestoneId: milestone,
            amountPaise: recorded,
            method: 'razorpay',
            receivedOn: todayIn('Asia/Kolkata', paid.paidAt),
            reference: paid.gatewayPaymentId,
            gatewayPaymentId: paid.gatewayPaymentId,
            gatewayFeePaise: paid.feePaise,
          },
          undefined,
          tx,
        );
      const paidTotal = link.link.paidPaise + paid.amountPaise;
      await tx
        .update(paymentLinks)
        .set({
          paidPaise: paidTotal,
          status: paidTotal >= link.link.amountPaise ? 'paid' : 'partly_paid',
          paidAt: paid.paidAt,
          updatedAt: new Date(),
        })
        .where(eq(paymentLinks.id, link.link.id));
      const excess = paid.amountPaise - recorded;
      if (excess > 0) await this.holdExcess(tx, link, paid, excess, recorded === 0);
      return excess > 0 ? `recorded with ${excess} paise extra held as credit` : 'recorded';
    });
  }

  private async alreadyRecorded(tx: Transaction, gatewayPaymentId: string): Promise<boolean> {
    const [seen] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.gatewayPaymentId, gatewayPaymentId));
    const [held] = await tx
      .select({ id: customerCredits.id })
      .from(customerCredits)
      .where(eq(customerCredits.gatewayPaymentId, gatewayPaymentId));
    return Boolean(seen || held);
  }

  /**
   * A payment already on record: an open link is closed as paid once its milestone is
   * paid (or it carries its full amount), so the link check stops asking about it.
   */
  private async settleLinkStatus(
    tx: Transaction,
    link: typeof paymentLinks.$inferSelect,
  ): Promise<void> {
    if (link.status !== 'created' && link.status !== 'partly_paid') return;
    const [milestone] = await tx
      .select({ status: paymentMilestones.status })
      .from(paymentMilestones)
      .where(eq(paymentMilestones.id, link.milestoneId));
    const full = milestone?.status === 'paid' || link.paidPaise >= link.amountPaise;
    await tx
      .update(paymentLinks)
      .set({ status: full ? 'paid' : 'partly_paid', updatedAt: new Date() })
      .where(eq(paymentLinks.id, link.id));
  }

  /**
   * The part above what was owed is kept as the customer's credit (with its ledger
   * entry), and finance is asked to refund it or apply it to the next milestone.
   */
  private async holdExcess(
    tx: Transaction,
    link: { link: typeof paymentLinks.$inferSelect; code: string; label: string },
    paid: GatewayPayment,
    excess: number,
    nothingOwed: boolean,
  ): Promise<void> {
    await recordGatewayExcess(tx, {
      projectId: link.link.projectId,
      milestoneId: link.link.milestoneId,
      amountPaise: excess,
      receivedOn: todayIn('Asia/Kolkata', paid.paidAt),
      gatewayPaymentId: paid.gatewayPaymentId,
      // With no payment row, the fee rides on the credit so it is still booked.
      feePaise: nothingOwed ? paid.feePaise : null,
    });
    await notifyHolders(tx, 'finance.record_payments', {
      kind: 'payment_excess',
      title: 'Online payment above what was owed',
      body: `${formatInr(excess)} more than was owed on ${link.code} · ${link.label} (${paid.gatewayPaymentId}). It is held as customer credit: refund it or apply it to the next milestone.`,
      subject: { type: 'payment', id: link.link.id, projectId: link.link.projectId },
      dedupeKey: `payment_excess:${paid.gatewayPaymentId}`,
    });
  }

  async markLink(providerLinkId: string, status: 'expired' | 'cancelled'): Promise<string> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(paymentLinks)
        .set({
          status,
          ...(status === 'cancelled' ? { cancelledAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(
          sql`${paymentLinks.providerLinkId} = ${providerLinkId} and ${paymentLinks.status} in ('created', 'partly_paid')`,
        )
        .returning({ id: paymentLinks.id });
      // Only the call that closed the link sees a row, so a repeat sends nothing.
      if (status === 'expired' && rows[0]) await sendFreshLinkAfterExpiry(tx, rows[0].id);
      return rows.length > 0 ? status : 'no open link';
    });
  }

  async recordPayout(payout: GatewayPayout): Promise<string> {
    const [row] = await this.db
      .insert(gatewaySettlements)
      .values({
        provider: payout.provider,
        providerSettlementId: payout.providerSettlementId,
        amountPaise: payout.amountPaise,
        feesPaise: payout.feesPaise,
        taxPaise: payout.taxPaise,
        utr: payout.utr,
        settledOn: todayIn('Asia/Kolkata', payout.settledAt),
      })
      .onConflictDoNothing()
      .returning({ id: gatewaySettlements.id });
    if (!row) return 'already recorded';
    await postSettlement(this.db, row.id);
    return 'recorded';
  }
}
