import { type DatabaseExecutor, messageTemplates, waConversations } from '@oneohm/database';
import { chatWindowOpen, type MilestoneTrigger } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';
import { environmentOnce } from '../../config/environment-once';
import { customerPdfName } from '../reports/pdf-file-name';
import { CHAT_WORDS } from '../whatsapp/assistant/chat-words';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
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
 * Tells the customer their payment arrived (`payment_received`), with the receipt PDF.
 * The approved plain template has no file slot, so while the customer has written in the
 * last 24 hours the receipt also goes as a chat file. Not sent twice per payment, and not
 * sent when the template's own version with the file is switched on. In that window the
 * chat then says, in the customer's language, what happens next and who to call, with
 * View receipt / Track my project / Menu taps (live review C6, C7); after a part payment
 * it says what is left, with Pay now, instead (live QA round 2).
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
  await queueWhatsApp(
    tx,
    news.phone,
    'payment_received',
    {
      customer: titleCaseName(news.customerName),
      project: news.projectCode,
      amount: formatInr(news.amountPaise),
      milestone: news.milestoneLabel,
      milestoneId: news.milestoneId,
      documentUrl: receipt.link,
      documentName: receipt.filename,
    },
    news.dedupeKey,
  );
  const [template] = await tx
    .select({ extrasApproved: messageTemplates.extrasApproved })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'payment_received'))
    .limit(1);
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
  if (!chat || chat.optedOutAt || !chatWindowOpen(chat.at)) return;
  const { language, contact } = await contactFor(tx, news.projectId);
  await inLanguage(language, async () => {
    // The template's own version with the file already carries the receipt.
    if (!template?.extrasApproved) {
      const caption = PROJECT_WORDS.receiptCaption(news.receiptNumber);
      const document = { kind: 'document', ...receipt, caption } as const;
      await queueReply(tx, chat, document, null, `receipt_pdf:${news.paymentId}`);
    }
    if (news.leftPaise > 0) return tellLeft(tx, chat, news);
    const next = PROJECT_WORDS.paidNext(news.trigger, contact.name, contact.phone);
    // View receipt sends this receipt's PDF again (live QA round 2).
    const receiptTap = { tap: 'receipt', id: paperTap('receipt', news.paymentId) } as const;
    const taps = [receiptTap, 'update', 'menu'] as const;
    await sayWithTaps(tx, chat, next, taps, `paid_next:${news.paymentId}`);
  });
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
): Promise<void> {
  const env = environmentOnce();
  const body = PROJECT_WORDS.partPaid(formatInr(news.amountPaise), formatInr(news.leftPaise));
  const key = `paid_left:${news.paymentId}`;
  if (env.RAZORPAY_MODE === 'off') return sayWithTaps(tx, chat, body, ['menu', 'talk'], key);
  const url = payPageUrl(env, news.customerId, news.milestoneId);
  const payNow = { kind: 'cta_url', body, label: WORDS.payNow, url } as const;
  await queueReply(tx, chat, payNow, null, key);
  // A link button has no reply taps, so the way on follows it (menu audit M3).
  await sayWithTaps(tx, chat, CHAT_WORDS.whatNext, ['menu', 'talk'], `${key}:taps`);
}
