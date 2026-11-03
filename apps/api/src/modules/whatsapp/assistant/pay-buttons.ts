import type { Database } from '@oneohm/database';
import { paymentMilestones, payments, projects } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { signPayToken } from '@oneohm/shared/pay-token';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Environment } from '../../../config/environment';
import type { ChatReply } from '../chat-store';
import { ANSWER_WORDS, WORDS } from './words';

/**
 * One "Pay now" message for each amount the customer owes, each opening the web pay page
 * (never paying inside WhatsApp). Nothing when online payments are off.
 */
export async function payNowReplies(
  db: Database,
  env: Environment,
  customerId: string,
): Promise<ChatReply[]> {
  if (env.RAZORPAY_MODE === 'off') return [];
  const rows = await db
    .select({
      id: paymentMilestones.id,
      label: paymentMilestones.label,
      amount: paymentMilestones.amountPaise,
      code: projects.code,
      paid: sql<string>`coalesce((select sum(${payments.amountPaise}) from ${payments} where ${payments.milestoneId} = ${paymentMilestones.id}), 0)`,
    })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .where(
      and(
        eq(projects.customerId, customerId),
        eq(paymentMilestones.payer, 'customer'),
        inArray(paymentMilestones.status, ['due', 'partly_paid']),
      ),
    )
    .orderBy(paymentMilestones.position);
  const exp = Math.floor(Date.now() / 1000) + env.PAYMENT_LINK_DAYS * 86_400;
  return rows.flatMap((row) => {
    const left = row.amount - Number(row.paid);
    if (left <= 0) return [];
    const token = signPayToken(env.FILE_LINK_SECRET, {
      milestoneId: row.id,
      customerId,
      exp,
    });
    return [
      {
        kind: 'cta_url' as const,
        body: `*${row.code}*\n${ANSWER_WORDS.due(row.label, formatInr(left))}`,
        label: WORDS.payNow,
        url: `${env.API_PUBLIC_URL}/v1/pay/due/${token}`,
      },
    ];
  });
}
