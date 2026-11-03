import type { QuotationDetail } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  messageTemplates,
  waConversations,
} from '@oneohm/database';
import { chatWindowOpen } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { Environment } from '../../config/environment';
import { pdfFileName } from '../reports/pdf-file-name';
import { queueReply } from '../whatsapp/chat-store';
import { sharedFileUrl } from '../whatsapp/file-links';

/** The quote's PDF as a link the customer's phone can open, named by the quote number. */
function pdfOf(env: Environment, quotation: QuotationDetail) {
  return {
    link: sharedFileUrl(env, {
      kind: 'quotation',
      id: quotation.id,
      customerId: quotation.customer.id,
    }),
    filename: pdfFileName(quotation.number, quotation.revision),
  };
}

/** What the `quotation_sent` message carries: the figures, the PDF and the two buttons. */
export function quoteMessage(env: Environment, quotation: QuotationDetail): Record<string, string> {
  const pdf = pdfOf(env, quotation);
  return {
    customer: quotation.customer.name,
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
 * arrives even if the approved template has no file slot yet. Sent once per quotation.
 * Not queued when the template's extras switch is on: its header already carries the file.
 */
export async function queueQuotePdf(
  tx: DatabaseExecutor,
  env: Environment,
  quotation: QuotationDetail,
): Promise<void> {
  const [template] = await tx
    .select({ extrasApproved: messageTemplates.extrasApproved })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'quotation_sent'))
    .limit(1);
  if (template?.extrasApproved) return;
  const [chat] = await tx
    .select({
      id: waConversations.id,
      phone: waConversations.phone,
      at: waConversations.lastInboundAt,
    })
    .from(waConversations)
    .where(eq(waConversations.phone, quotation.customerPhone))
    .limit(1);
  if (!chat || !chatWindowOpen(chat.at)) return;
  const pdf = pdfOf(env, quotation);
  await queueReply(
    tx,
    chat,
    { kind: 'document', ...pdf, caption: `Quotation ${quotation.number}` },
    null,
    `quote_pdf:${quotation.id}`,
  );
  // The approved plain template has no buttons, so the chat gets them right after the PDF.
  const [customer] = await tx
    .select({ language: customers.preferredLanguage })
    .from(customers)
    .where(eq(customers.id, quotation.customer.id))
    .limit(1);
  const words = QUOTE_BUTTONS[customer?.language ?? ''] ?? ENGLISH_BUTTONS;
  await queueReply(
    tx,
    chat,
    {
      kind: 'buttons',
      body: words.body(quotation.number),
      buttons: [
        { id: `quote_accept:${quotation.id}`, title: words.accept },
        { id: `quote_ask:${quotation.id}`, title: words.ask },
      ],
    },
    null,
    `quote_buttons:${quotation.id}`,
  );
}

interface QuoteButtonWords {
  readonly body: (number: string) => string;
  readonly accept: string;
  readonly ask: string;
}

const ENGLISH_BUTTONS: QuoteButtonWords = {
  body: (number) => `Your quotation ${number} is above. Happy to go ahead?`,
  accept: 'Accept quote',
  ask: 'I have a question',
};

/** Words for the two quote buttons, in the customer's language. Titles keep 20 characters. */
const QUOTE_BUTTONS: Record<string, QuoteButtonWords> = {
  'en-IN': ENGLISH_BUTTONS,
  'mr-IN': {
    body: (number) => `तुमचे कोटेशन ${number} वर आहे. पुढे जायचे का?`,
    accept: 'कोटेशन स्वीकारा',
    ask: 'मला प्रश्न आहे',
  },
  'hi-IN': {
    body: (number) => `आपका कोटेशन ${number} ऊपर है. आगे बढ़ें?`,
    accept: 'कोटेशन स्वीकारें',
    ask: 'मेरा एक सवाल है',
  },
};
