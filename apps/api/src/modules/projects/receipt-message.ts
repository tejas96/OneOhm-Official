import {
  type DatabaseExecutor,
  noticeCustomer,
  plainNames,
  projectTasks,
  routeOfCustomer,
  waConversations,
  withFallback,
} from '@oneohm/database';
import { chatWindowOpen, type MilestoneTrigger } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';
import { environmentOnce } from '../../config/environment-once';
import { customerPdfName } from '../reports/pdf-file-name';
import { CHAT_WORDS } from '../whatsapp/assistant/chat-words';
import { sayWithTaps, withTaps } from '../whatsapp/assistant/closing-taps';
import { paperTap } from '../whatsapp/assistant/customer-papers';
import { inLanguage } from '../whatsapp/assistant/language';
import { payPageUrl } from '../whatsapp/assistant/pay-buttons';
import { PROJECT_WORDS } from '../whatsapp/assistant/project-words';
import { WORDS } from '../whatsapp/assistant/words';
import { queueReply } from '../whatsapp/chat-store';
import { sharedFileUrl } from '../whatsapp/file-links';
import { contactFor } from './payment-contact';

export interface PaidNews {
  readonly paymentId: string;
  readonly receiptNumber: string;
  readonly phone: string;
  readonly customerName: string;
  readonly customerId: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly amountPaise: number;
  readonly milestoneId: string;
  readonly milestoneLabel: string;
  /** What is still owed on the instalment after this payment; 0 once it is paid. */
  readonly leftPaise: number;
  /** What the paid instalment was for, so the chat says what happens next. */
  readonly trigger: MilestoneTrigger;
  readonly dedupeKey: string;
}

/**
 * Tells the customer their payment arrived, with the receipt PDF. Outside the 24-hour
 * window that is the `payment_received` template (with the file when Meta approved it).
 * Inside it (and the customer is opted in) the customer gets ONE chat message instead, not
 * the template as well: the receipt PDF on top, then in their language what happens next
 * and who to call, with View receipt / Update / Menu taps (live review C6, C7, 2026-11-06).
 * After a part payment it is the receipt file, then what is left, with Pay now. Each message
 * has its own dedupe key, so a payment is told once however often it is recorded.
 */
export async function tellCustomerPaid(tx: DatabaseExecutor, news: PaidNews): Promise<void> {
  const receipt = {
    link: sharedFileUrl(environmentOnce(), {
      kind: 'receipt',
      id: news.paymentId,
      customerId: news.customerId,
    }),
    filename: customerPdfName(news.customerName, 'receipt'),
  };
  const payload = {
    customer: titleCaseName(news.customerName),
    project: news.projectCode,
    amount: formatInr(news.amountPaise),
    milestone: news.milestoneLabel,
    milestoneId: news.milestoneId,
    documentUrl: receipt.link,
    documentName: receipt.filename,
  };
  const chat = await openChat(tx, news);
  if (!chat) {
    await queueWhatsApp(tx, news.phone, 'payment_received', payload, news.dedupeKey);
    return;
  }
  // The chat carries the news, so the template is not queued; the app inbox still hears it.
  await noticeCustomer(
    tx,
    news.phone,
    'payment_received',
    await plainNames(tx, payload),
    news.dedupeKey,
  );
  const { language, contact } = await contactFor(tx, news.projectId);
  // If Meta turns out to refuse these chat messages (window closed), the customer still gets
  // the template with the receipt; the shared key means it is queued once, and as the app notice's.
  const fb = <T extends object>(reply: T) =>
    withFallback(reply, 'payment_received', payload, news.dedupeKey);
  await inLanguage(language, async () => {
    if (news.leftPaise > 0) {
      const caption = PROJECT_WORDS.receiptCaption(news.receiptNumber);
      const document = { kind: 'document', ...receipt, caption } as const;
      await queueReply(tx, chat, fb(document), null, `receipt_pdf:${news.paymentId}`);
      return tellLeft(tx, chat, news, fb);
    }
    const next = PROJECT_WORDS.paidNext(
      news.trigger,
      contact.name,
      contact.phone,
      await surveyIsDone(tx, news.projectId),
    );
    // View receipt sends this receipt's PDF again (live QA round 2).
    const receiptTap = { tap: 'receipt', id: paperTap('receipt', news.paymentId) } as const;
    const key = `paid_next:${news.paymentId}`;
    const [first, ...rest] = withTaps(next, [receiptTap, 'update', 'menu']);
    const header = { document: { url: receipt.link, filename: receipt.filename } };
    if (first?.kind === 'buttons' && rest.length === 0)
      return queueReply(tx, chat, fb({ ...first, header }), null, key);
    // A message too long for a header: the file on its own first, then the words and taps.
    const caption = PROJECT_WORDS.receiptCaption(news.receiptNumber);
    await queueReply(
      tx,
      chat,
      fb({ kind: 'document', ...receipt, caption }),
      null,
      `receipt_pdf:${news.paymentId}`,
    );
    for (const [index, reply] of [first, ...rest].entries())
      if (reply)
        await queueReply(
          tx,
          chat,
          index === 0 ? fb(reply) : reply,
          null,
          index === 0 ? key : undefined,
        );
  });
}

/** The customer's open chat when a chat message can carry the news; null for a template. */
async function openChat(tx: DatabaseExecutor, news: PaidNews) {
  const [chat] = await tx
    .select({
      id: waConversations.id,
      phone: waConversations.phone,
      at: waConversations.lastInboundAt,
      optedOutAt: waConversations.optedOutAt,
    })
    .from(waConversations)
    .where(eq(waConversations.phone, news.phone))
    .limit(1);
  // A chat that sent STOP gets no chat messages, even inside the 24 hours.
  if (!chat || chat.optedOutAt || !chatWindowOpen(chat.at)) return null;
  // A customer who moved to SMS or left WhatsApp gets the routed message, not a chat one.
  return (await routeOfCustomer(tx, news.customerId)) === 'whatsapp' ? chat : null;
}

/** The site survey is done, or this project has none: the next step is the design. */
async function surveyIsDone(tx: DatabaseExecutor, projectId: string): Promise<boolean> {
  const [survey] = await tx
    .select({ status: projectTasks.status })
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.templateKey, 'site_survey')))
    .limit(1);
  return !survey || survey.status === 'completed';
}

/**
 * Part of an instalment paid (UPI takes ₹1 lakh at a time): what came in and what is
 * left, with Pay now on the same pay page, which reopens the same Razorpay link, then
 * Menu · Talk to us. What happens next waits until the instalment is paid.
 */
async function tellLeft(
  tx: DatabaseExecutor,
  chat: { readonly id: string; readonly phone: string },
  news: PaidNews,
  fb: <T extends object>(reply: T) => T,
): Promise<void> {
  const env = environmentOnce();
  const body = PROJECT_WORDS.partPaid(formatInr(news.amountPaise), formatInr(news.leftPaise));
  const key = `paid_left:${news.paymentId}`;
  if (env.RAZORPAY_MODE === 'off') {
    for (const [index, reply] of withTaps(body, ['menu', 'talk']).entries())
      await queueReply(
        tx,
        chat,
        index === 0 ? fb(reply) : reply,
        null,
        index === 0 ? key : undefined,
      );
    return;
  }
  const url = payPageUrl(env, news.customerId, news.milestoneId);
  const payNow = { kind: 'cta_url', body, label: WORDS.payNow, url } as const;
  await queueReply(tx, chat, fb(payNow), null, key);
  // A link button has no reply taps, so the way on follows it (menu audit M3).
  await sayWithTaps(tx, chat, CHAT_WORDS.whatNext, ['menu', 'talk'], `${key}:taps`);
}
