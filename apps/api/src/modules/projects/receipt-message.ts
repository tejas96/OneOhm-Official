import { type DatabaseExecutor, messageTemplates, waConversations } from '@oneohm/database';
import { chatWindowOpen } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';
import { environmentOnce } from '../../config/environment-once';
import { pdfFileName } from '../reports/pdf-file-name';
import { queueReply } from '../whatsapp/chat-store';
import { sharedFileUrl } from '../whatsapp/file-links';

export interface PaidNews {
  readonly paymentId: string;
  readonly receiptNumber: string;
  readonly phone: string;
  readonly customerName: string;
  readonly customerId: string;
  readonly projectCode: string;
  readonly amountPaise: number;
  readonly milestoneLabel: string;
  readonly dedupeKey: string;
}

/**
 * Tells the customer their payment arrived (`payment_received`), with the receipt PDF.
 * The approved plain template has no file slot, so while the customer has written in the
 * last 24 hours the receipt also goes as a chat file. Not sent twice per payment, and not
 * sent when the template's own version with the file is switched on.
 */
export async function tellCustomerPaid(tx: DatabaseExecutor, news: PaidNews): Promise<void> {
  const receipt = {
    link: sharedFileUrl(environmentOnce(), {
      kind: 'receipt',
      id: news.paymentId,
      customerId: news.customerId,
    }),
    filename: pdfFileName(news.receiptNumber),
  };
  await queueWhatsApp(
    tx,
    news.phone,
    'payment_received',
    {
      customer: news.customerName,
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
  if (template?.extrasApproved) return;
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
  await queueReply(
    tx,
    chat,
    { kind: 'document', ...receipt, caption: `Receipt ${news.receiptNumber}` },
    null,
    `receipt_pdf:${news.paymentId}`,
  );
}
