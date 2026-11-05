import {
  customers,
  type DatabaseExecutor,
  homeNameOf,
  paymentMilestones,
  payments,
  projects,
} from '@oneohm/database';
import { finalCustomerMilestones, milestoneDueNotice } from '@oneohm/domain';
import { eq, inArray, sql } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';
import { environmentOnce } from '../../config/environment-once';
import { mayChat, send } from '../journey/auto-messages';
import { paymentAsk } from '../send-to-customer/send-messages';
import { payNowPayload } from './pay-now-message';

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
    const payload = payNowPayload(env, {
      customerName: customer.name,
      customerId: project.customerId,
      projectCode: project.code,
      milestoneId: milestone.id,
      milestoneLabel: milestone.label,
      owedPaise: notice.owedPaise,
    });
    const key = `milestone_due:${milestone.id}`;
    // Inside the 24-hour window: the chat message with [Pay ₹X] [I paid another way] (redesign §19).
    if (await mayChat(db, customer.phone, notice.message)) {
      const home = await homeNameOf(db, project.id, null);
      const online = env.RAZORPAY_MODE !== 'off';
      await send(db, customer, {
        template: notice.message,
        payload,
        key,
        reply: async () => {
          const ask = paymentAsk('reminder', {
            customer: customer.name,
            leftPaise: notice.owedPaise,
            home,
            milestoneId: milestone.id,
            online,
          });
          const [reply] = ask.replies;
          if (!reply) throw new Error('payment ask without a chat message');
          return reply;
        },
      });
      continue;
    }
    // Only the pay-link template carries the link itself; the others keep the token.
    await queueWhatsApp(
      db,
      customer.phone,
      notice.message,
      notice.message === 'payment_link' ? payload : withoutLink(payload),
      key,
    );
  }
}

/** The other due messages carry the token but not the link itself. */
function withoutLink({ link: _link, ...rest }: Record<string, string>): Record<string, string> {
  return rest;
}
