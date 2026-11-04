import type { Database } from '@oneohm/database';
import { paymentMilestones, payments, projects, properties } from '@oneohm/database';
import type { MilestoneTrigger } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Environment } from '../../../config/environment';
import { activeProjectsOf } from '../../customer-portal/active-projects';
import { paySigningSecret, signPayToken } from '../../online-payments/pay-token';
import { QUOTE_MONEY_WORDS } from '../../quotations/quote-money-words';
import type { ChatReply } from '../chat-store';
import { CHAT_WORDS } from './chat-words';
import { WORDS } from './words';

/** Our pay page for one due amount: it makes the gateway page only when opened. */
export function payPageUrl(env: Environment, customerId: string, milestoneId: string): string {
  const exp = Math.floor(Date.now() / 1000) + env.PAYMENT_LINK_DAYS * 86_400;
  const token = signPayToken(paySigningSecret(env), { milestoneId, customerId, exp });
  return `${env.API_PUBLIC_URL}/v1/pay/due/${token}`;
}

/**
 * One "Pay now" message for each amount the customer owes, each opening the web pay page
 * (never paying inside WhatsApp). Nothing when online payments are off.
 */
export async function payNowReplies(
  db: Database,
  env: Environment,
  customerId: string,
  milestoneId?: string,
): Promise<ChatReply[]> {
  if (env.RAZORPAY_MODE === 'off') return [];
  const rows = await db
    .select({
      id: paymentMilestones.id,
      amount: paymentMilestones.amountPaise,
      city: properties.city,
      label: properties.label,
      trigger: paymentMilestones.trigger,
      paid: sql<string>`coalesce((select sum(${payments.amountPaise}) from ${payments} where ${payments.milestoneId} = ${paymentMilestones.id}), 0)`,
    })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(
      and(
        activeProjectsOf(customerId),
        eq(paymentMilestones.payer, 'customer'),
        inArray(paymentMilestones.status, ['due', 'partly_paid']),
        milestoneId ? eq(paymentMilestones.id, milestoneId) : undefined,
      ),
    )
    .orderBy(paymentMilestones.position);
  return rows.flatMap((row) => {
    const left = row.amount - Number(row.paid);
    if (left <= 0) return [];
    return [
      {
        kind: 'cta_url' as const,
        body: CHAT_WORDS.payLink(
          formatInr(left),
          QUOTE_MONEY_WORDS.when[row.trigger as MilestoneTrigger] ?? '',
          row.label?.trim() || row.city,
        ),
        label: WORDS.payNow,
        url: payPageUrl(env, customerId, row.id),
      },
    ];
  });
}
