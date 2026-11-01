import { Inject, Injectable } from '@nestjs/common';
import {
  customers,
  paymentMilestones,
  payments,
  projectActivities,
  projects,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { DATABASE, type Database } from '../../config/core.module';

export interface NewPayment {
  milestoneId: string;
  amountPaise: number;
  method: 'cash' | 'cheque' | 'bank_transfer' | 'upi' | 'razorpay' | 'bank_disbursement';
  receivedOn: string;
  reference?: string | null | undefined;
}

/** Every rupee received is recorded against a milestone and reconciled (PRD 3.11). */
@Injectable()
export class FinanceService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async recordPayment(actor: Actor, projectId: string, input: NewPayment): Promise<void> {
    const [milestone] = await this.db
      .select()
      .from(paymentMilestones)
      .where(
        and(
          eq(paymentMilestones.id, input.milestoneId),
          eq(paymentMilestones.projectId, projectId),
        ),
      )
      .limit(1);
    if (!milestone) throw notFound('That payment milestone');
    const [paid] = await this.db
      .select({ total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint` })
      .from(payments)
      .where(eq(payments.milestoneId, milestone.id));
    const already = Number(paid?.total ?? 0);
    if (already + input.amountPaise > milestone.amountPaise) {
      throw invalid('This is more than is left on the milestone.', {
        amountPaise: `At most ${formatInr(milestone.amountPaise - already)} is left on this milestone.`,
      });
    }
    if (milestone.payer === 'bank' && input.method !== 'bank_disbursement') {
      throw invalid('The bank share is recorded as a bank disbursement.', {
        method: 'Choose bank disbursement.',
      });
    }
    await this.db.transaction(async (tx) => {
      await tx.insert(payments).values({
        projectId,
        milestoneId: milestone.id,
        payer: milestone.payer,
        method: input.method,
        amountPaise: input.amountPaise,
        receivedOn: input.receivedOn,
        reference: input.reference ?? null,
        recordedByUserId: actor.userId,
      });
      const total = already + input.amountPaise;
      const status = total >= milestone.amountPaise ? 'paid' : 'partly_paid';
      await tx
        .update(paymentMilestones)
        .set({ status, updatedAt: new Date() })
        .where(eq(paymentMilestones.id, milestone.id));
      const open = await tx
        .select({ id: paymentMilestones.id })
        .from(paymentMilestones)
        .where(
          and(
            eq(paymentMilestones.projectId, projectId),
            sql`${paymentMilestones.status} <> 'paid'`,
          ),
        );
      const [project] = await tx
        .select({
          status: projects.status,
          code: projects.code,
          phone: customers.phoneE164,
          name: customers.name,
        })
        .from(projects)
        .innerJoin(customers, eq(customers.id, projects.customerId))
        .where(eq(projects.id, projectId))
        .limit(1);
      if (open.length === 0 && project?.status === 'completed') {
        await tx
          .update(projects)
          .set({ financiallyClosedAt: new Date(), updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      }
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'payment',
        message: `${formatInr(input.amountPaise)} received (${milestone.label}).`,
        userId: actor.userId,
      });
      if (project && milestone.payer === 'customer') {
        await queueWhatsApp(
          tx,
          project.phone,
          'payment_received',
          {
            customer: project.name,
            project: project.code,
            amount: formatInr(input.amountPaise),
            milestone: milestone.label,
          },
          `payment:${milestone.id}:${total}`,
        );
      }
      await recordAudit(tx, actor.userId, 'payment.recorded', 'project', projectId, {
        milestoneId: milestone.id,
        amountPaise: input.amountPaise,
        method: input.method,
      });
    });
  }
}
