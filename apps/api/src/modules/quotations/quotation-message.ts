import { randomUUID } from 'node:crypto';
import type { QuotationDetail } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  messageTemplates,
  outbox,
  waConversations,
} from '@oneohm/database';
import { chatWindowOpen } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { desc, eq, like } from 'drizzle-orm';
import type { Environment } from '../../config/environment';
import { customerPdfName } from '../reports/pdf-file-name';
import { assistantLanguage, inLanguage } from '../whatsapp/assistant/language';
import { queueReply } from '../whatsapp/chat-store';
import { sharedFileUrl } from '../whatsapp/file-links';
import { QUOTE_MONEY_WORDS, quoteMoney } from './quote-money-words';
import { quotedSteps } from './quoted-terms';

/** The quote's PDF as a link the customer's phone can open, named for the customer. */
function pdfOf(env: Environment, quotation: QuotationDetail) {
  return {
    link: sharedFileUrl(env, {
      kind: 'quotation',
      id: quotation.id,
      customerId: quotation.customer.id,
    }),
    filename: customerPdfName(quotation.customer.name, 'quote', quotation.revision),
  };
}

/** What the `quotation_sent` message carries: the figures, the PDF and the two buttons. */
export function quoteMessage(env: Environment, quotation: QuotationDetail): Record<string, string> {
  const pdf = pdfOf(env, quotation);
  return {
    customer: titleCaseName(quotation.customer.name),
    number: quotation.number,
    total: formatInr(quotation.totalPaise),
    subsidy: formatInr(quotation.subsidyPaise),
    effective: formatInr(quotation.effectivePaise),
    documentUrl: pdf.link,
    documentName: pdf.filename,
    acceptPayload: `quote_accept:${quotation.id}`,
    askPayload: `quote_ask:${quotation.id}`,
  };
}

/**
 * When the customer wrote in the last 24 hours, the PDF also goes as a chat file, so it
 * arrives even if the approved template has no file slot yet. Sent once per quotation;
 * "Send again" sends it again only when the earlier one failed, but always sends the
 * buttons again. Not queued when the template's extras switch is on: its header already carries the file,
 * nor to a chat that sent STOP. Returns whether the PDF and buttons went, so the plain
 * template can stay back (live review C8: one message, not three).
 */
export async function queueQuotePdf(
  tx: DatabaseExecutor,
  env: Environment,
  quotation: QuotationDetail,
): Promise<boolean> {
  const [template] = await tx
    .select({ extrasApproved: messageTemplates.extrasApproved })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'quotation_sent'))
    .limit(1);
  if (template?.extrasApproved) return false;
  const [chat] = await tx
    .select({
      id: waConversations.id,
      phone: waConversations.phone,
      at: waConversations.lastInboundAt,
      optedOutAt: waConversations.optedOutAt,
    })
    .from(waConversations)
    .where(eq(waConversations.phone, quotation.customerPhone))
    .limit(1);
  if (!chat || chat.optedOutAt || !chatWindowOpen(chat.at)) return false;
  const [earlier] = await tx
    .select({ status: outbox.status, delivery: outbox.deliveryStatus })
    .from(outbox)
    .where(like(outbox.dedupeKey, `quote_pdf:${quotation.id}%`))
    .orderBy(desc(outbox.createdAt))
    .limit(1);
  const failed = earlier?.status === 'failed' || earlier?.delivery === 'failed';
  // The approved plain template has no buttons, so the chat gets them right after the PDF,
  // with the money in plain words (live review C1), in the customer's language.
  const [customer] = await tx
    .select({ language: customers.preferredLanguage })
    .from(customers)
    .where(eq(customers.id, quotation.customer.id))
    .limit(1);
  await inLanguage(assistantLanguage(customer?.language), async () => {
    const pdfKey = earlier
      ? `quote_pdf:${quotation.id}:${randomUUID()}`
      : `quote_pdf:${quotation.id}`;
    await queueQuoteInChat(tx, env, quotation, chat, !earlier || failed ? pdfKey : null);
  });
  return true;
}

/**
 * The quote in the chat, in the language being spoken: its PDF (unless `pdfKey` is null),
 * then the money in plain words with [Accept quote] [I have a question]. Home's [See
 * quotation] sends it this way too (redesign §3).
 */
export async function queueQuoteInChat(
  tx: DatabaseExecutor,
  env: Environment,
  quotation: QuotationDetail,
  chat: { readonly id: string; readonly phone: string },
  pdfKey: string | null = `quote_pdf:${quotation.id}:${randomUUID()}`,
): Promise<void> {
  const W = QUOTE_MONEY_WORDS;
  if (pdfKey) {
    const document = { kind: 'document', ...pdfOf(env, quotation) } as const;
    await queueReply(tx, chat, { ...document, caption: W.caption(quotation.number) }, null, pdfKey);
  }
  const steps = await quotedSteps(tx, quotation.id);
  const money = quoteMoney(quotation.totalPaise, quotation.subsidyPaise, steps);
  await queueReply(
    tx,
    chat,
    {
      kind: 'buttons',
      body: W.buttonsBody(money.line),
      buttons: [
        { id: `quote_accept:${quotation.id}`, title: W.accept },
        { id: `quote_ask:${quotation.id}`, title: W.ask },
      ],
    },
    null,
    `quote_buttons:${quotation.id}:${randomUUID()}`,
  );
}
