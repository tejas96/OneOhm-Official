import {
  customers,
  type DatabaseExecutor,
  paymentMilestones,
  payments,
  projects,
} from '@oneohm/database';
import { finalCustomerMilestones, milestoneDueNotice } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';
import { environmentOnce } from '../../config/environment-once';
import { signPayToken } from './pay-token';

/**
 * Tells the customer that payment milestones just fell due (PRD 6.2 "payment milestone
 * due"): the amount, and a pay link when online payments are on. Runs in the caller's
 * transaction (task completion) and calls no gateway: the link is a OneOhm link that
 * makes the Razorpay page only when opened. Each milestone is told once.
 */
export async function tellCustomerMilestonesDue(
  db: DatabaseExecutor,
  milestoneIds: readonly string[],
): Promise<void> {
  if (milestoneIds.length === 0) return;
  const rows = await db
    .select({
      milestone: paymentMilestones,
      project: { id: projects.id, code: projects.code, customerId: projects.customerId },
      customer: { name: customers.name, phone: customers.phoneE164 },
      paidPaise: sql<string>`coalesce((select sum(${payments.amountPaise}) from ${payments} where ${payments.milestoneId} = ${paymentMilestones.id}), 0)`,
    })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(inArray(paymentMilestones.id, [...milestoneIds]));
  if (rows.length === 0) return;
  const siblings = await db
    .select({
      id: paymentMilestones.id,
      projectId: paymentMilestones.projectId,
      payer: paymentMilestones.payer,
      position: paymentMilestones.position,
    })
    .from(paymentMilestones)
    .where(inArray(paymentMilestones.projectId, [...new Set(rows.map((row) => row.project.id))]));
  const final = finalCustomerMilestones(siblings);
  const env = environmentOnce();
  for (const { milestone, project, customer, paidPaise } of rows) {
    const notice = milestoneDueNotice({
      payer: milestone.payer,
      amountPaise: milestone.amountPaise,
      paidPaise: Number(paidPaise),
      final: final.has(milestone.id),
      onlinePayments: env.RAZORPAY_MODE !== 'off',
    });
    if (!notice.send) continue;
    const exp = Math.floor(Date.now() / 1000) + env.PAYMENT_LINK_DAYS * 86_400;
    const token = signPayToken(env.FILE_LINK_SECRET, {
      milestoneId: milestone.id,
      customerId: project.customerId,
      exp,
    });
    await queueWhatsApp(
      db,
      customer.phone,
      notice.message,
      {
        customer: customer.name,
        amount: formatInr(notice.owedPaise),
        milestone: milestone.label,
        project: project.code,
        ...(notice.message === 'payment_link'
          ? { link: `${env.API_PUBLIC_URL}/v1/pay/due/${token}`, payToken: token }
          : {}),
      },
      `milestone_due:${milestone.id}`,
    );
  }
}
