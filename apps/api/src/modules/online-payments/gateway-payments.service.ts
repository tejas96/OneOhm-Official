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
} from '@oneohm/database';
import { formatInr, todayIn } from '@oneohm/shared';
import { eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { recordGatewayExcess } from '../finance/customer-credit-excess';
import { FinanceService } from '../projects/finance.service';

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

  async recordLinkPayment(paid: GatewayPayment): Promise<string> {
    const [link] = await this.db
      .select({ link: paymentLinks, code: projects.code, label: paymentMilestones.label })
      .from(paymentLinks)
      .innerJoin(projects, eq(projects.id, paymentLinks.projectId))
      .innerJoin(paymentMilestones, eq(paymentMilestones.id, paymentLinks.milestoneId))
      .where(eq(paymentLinks.providerLinkId, paid.providerLinkId))
      .limit(1);
    if (!link) return 'unknown link';
    const [seen] = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.gatewayPaymentId, paid.gatewayPaymentId));
    const [held] = await this.db
      .select({ id: customerCredits.id })
      .from(customerCredits)
      .where(eq(customerCredits.gatewayPaymentId, paid.gatewayPaymentId));
    if (seen || held) return 'already recorded';
    const milestone = link.link.milestoneId;
    // Two plain queries: inside a correlated subquery Drizzle prints the milestone's
    // id as a bare "id", which would bind to payments.id and ignore earlier payments.
    const [owed] = await this.db
      .select({ amount: paymentMilestones.amountPaise })
      .from(paymentMilestones)
      .where(eq(paymentMilestones.id, milestone));
    const [paidSoFar] = await this.db
      .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
      .from(payments)
      .where(eq(payments.milestoneId, milestone));
    const left = Math.max(0, (owed?.amount ?? 0) - Number(paidSoFar?.total ?? 0));
    const recorded = Math.min(left, paid.amountPaise);
    if (recorded > 0)
      await this.finance.recordPayment({ userId: null }, link.link.projectId, {
        milestoneId: milestone,
        amountPaise: recorded,
        method: 'razorpay',
        receivedOn: todayIn('Asia/Kolkata', paid.paidAt),
        reference: paid.gatewayPaymentId,
        gatewayPaymentId: paid.gatewayPaymentId,
        gatewayFeePaise: paid.feePaise,
      });
    const paidTotal = link.link.paidPaise + paid.amountPaise;
    await this.db
      .update(paymentLinks)
      .set({
        paidPaise: paidTotal,
        status: paidTotal >= link.link.amountPaise ? 'paid' : 'partly_paid',
        paidAt: paid.paidAt,
        updatedAt: new Date(),
      })
      .where(eq(paymentLinks.id, link.link.id));
    const excess = paid.amountPaise - recorded;
    if (excess > 0) await this.holdExcess(link, paid, excess, recorded === 0);
    return excess > 0 ? `recorded with ${excess} paise extra held as credit` : 'recorded';
  }

  /**
   * The part above what was owed is kept as the customer's credit (with its ledger
   * entry), and finance is asked to refund it or apply it to the next milestone.
   */
  private async holdExcess(
    link: { link: typeof paymentLinks.$inferSelect; code: string; label: string },
    paid: GatewayPayment,
    excess: number,
    nothingOwed: boolean,
  ): Promise<void> {
    await recordGatewayExcess(this.db, {
      projectId: link.link.projectId,
      milestoneId: link.link.milestoneId,
      amountPaise: excess,
      receivedOn: todayIn('Asia/Kolkata', paid.paidAt),
      gatewayPaymentId: paid.gatewayPaymentId,
      // With no payment row, the fee rides on the credit so it is still booked.
      feePaise: nothingOwed ? paid.feePaise : null,
    });
    await notifyHolders(this.db, 'finance.record_payments', {
      kind: 'payment_excess',
      title: 'Online payment above what was owed',
      body: `${formatInr(excess)} more than was owed on ${link.code} · ${link.label} (${paid.gatewayPaymentId}). It is held as customer credit: refund it or apply it to the next milestone.`,
      subject: { type: 'payment', id: link.link.id, projectId: link.link.projectId },
      dedupeKey: `payment_excess:${paid.gatewayPaymentId}`,
    });
  }

  async markLink(providerLinkId: string, status: 'expired' | 'cancelled'): Promise<string> {
    const rows = await this.db
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
    return rows.length > 0 ? status : 'no open link';
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
