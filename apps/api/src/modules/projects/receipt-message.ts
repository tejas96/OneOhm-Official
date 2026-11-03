import { type DatabaseExecutor, messageTemplates, waConversations } from '@oneohm/database';
import { chatWindowOpen, type MilestoneTrigger } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';
import { environmentOnce } from '../../config/environment-once';
import { customerPdfName } from '../reports/pdf-file-name';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { inLanguage } from '../whatsapp/assistant/language';
import { PROJECT_WORDS } from '../whatsapp/assistant/project-words';
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
  readonly milestoneLabel: string;
  /** What the paid instalment was for, so the chat says what happens next. */
  readonly trigger: MilestoneTrigger;
  readonly dedupeKey: string;
}

/**
 * Tells the customer their payment arrived (`payment_received`), with the receipt PDF.
 * The approved plain template has no file slot, so while the customer has written in the
 * last 24 hours the receipt also goes as a chat file. Not sent twice per payment, and not
 * sent when the template's own version with the file is switched on. In that window the
 * chat then always says, in the customer's language, what happens next and who to call, with
 * View receipt / Track my project / Menu taps (live review C6, C7).
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
    })
    .from(waConversations)
    .where(eq(waConversations.phone, news.phone))
    .limit(1);
  if (!chat || !chatWindowOpen(chat.at)) return;
  const { language, contact } = await contactFor(tx, news.projectId);
  await inLanguage(language, async () => {
    // The template's own version with the file already carries the receipt.
    if (!template?.extrasApproved) {
      const caption = PROJECT_WORDS.receiptCaption(news.receiptNumber);
      const document = { kind: 'document', ...receipt, caption } as const;
      await queueReply(tx, chat, document, null, `receipt_pdf:${news.paymentId}`);
    }
    const next = PROJECT_WORDS.paidNext(news.trigger, contact.name, contact.phone);
    const taps = ['receipt', 'track', 'menu'] as const;
    await sayWithTaps(tx, chat, next, taps, `paid_next:${news.paymentId}`);
  });
}
