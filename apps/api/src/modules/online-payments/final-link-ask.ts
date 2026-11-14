import {
  type DatabaseExecutor,
  homeNameOf,
  type MessageFallback,
  noticeCustomer,
  outbox,
  withFallback,
} from '@oneohm/database';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { environmentOnce } from '../../config/environment-once';
import { languageOfPhone } from '../documents/document-request-messages';
import { paymentAsk } from '../send-to-customer/send-messages';
import { inLanguage } from '../whatsapp/assistant/language';
import { conversationForPhone, queueReply } from '../whatsapp/chat-store';
import { payNowPayload } from './pay-now-message';

/** A chat message that is sent, or about to be, is an ask; a failed or skipped one reached nobody. */
export const ASKED_STATUSES = ['sent', 'pending'] as const;

/** Whether the chat already carries (or is about to carry) a [Pay] button for this milestone. */
export async function payAsked(
  db: DatabaseExecutor,
  phone: string,
  milestoneId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      and(
        eq(outbox.recipient, phone),
        like(outbox.template, 'session:%'),
        inArray(outbox.status, [...ASKED_STATUSES]),
        sql`${outbox.payload}::text like ${`%"pay:${milestoneId}"%`}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** What the customer gets instead when the chat window turns out to be closed: the payment link template. */
export function payFallback(milestoneId: string, payload: Record<string, string>): MessageFallback {
  return { template: 'payment_link', payload, dedupeKey: `milestone_due:${milestoneId}` };
}

export interface PayAskFor {
  readonly phone: string;
  readonly customerName: string;
  readonly customerId: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly milestone: { readonly id: string; readonly label: string };
  readonly owedPaise: number;
}

/**
 * The in-chat payment ask ([Pay ₹X] [I paid another way]) for the final instalment, queued directly:
 * the milestone-due notice stays quiet for a final milestone. Carries the payment_link template as
 * its fallback, so a closed window still gets the link.
 */
export async function askToPayInChat(db: DatabaseExecutor, given: PayAskFor): Promise<void> {
  const payload = payNowPayload(environmentOnce(), {
    customerName: given.customerName,
    customerId: given.customerId,
    projectCode: given.projectCode,
    milestoneId: given.milestone.id,
    milestoneLabel: given.milestone.label,
    owedPaise: given.owedPaise,
  });
  const home = await homeNameOf(db, given.projectId, null);
  const language = await languageOfPhone(db, given.phone);
  const built = await inLanguage(language, async () =>
    paymentAsk('reminder', {
      customer: given.customerName,
      leftPaise: given.owedPaise,
      home,
      milestoneId: given.milestone.id,
      online: true,
    }),
  );
  const [reply] = built.replies;
  if (!reply) throw new Error('payment ask without a chat message');
  const chat = await conversationForPhone(db, given.phone);
  await queueReply(
    db,
    chat,
    withFallback(
      reply,
      'payment_link',
      payload,
      payFallback(given.milestone.id, payload).dedupeKey,
    ),
    null,
    `final_pay:${given.milestone.id}`,
  );
  await noticeCustomer(db, given.phone, 'payment_link', payload, `final_pay:${given.milestone.id}`);
}
