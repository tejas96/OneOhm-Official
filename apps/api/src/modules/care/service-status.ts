import { type DatabaseExecutor, noticeCustomer } from '@oneohm/database';
import { queueWhatsApp } from '../../common/outbox';
import { languageOfPhone } from '../documents/document-request-messages';
import { chatOpenFor } from '../send-to-customer/send-context';
import { inLanguage } from '../whatsapp/assistant/language';
import { CATEGORY_WORDS } from '../whatsapp/assistant/words';
import { conversationForPhone, queueReply } from '../whatsapp/chat-store';
import { SERVICE_STATUS_WORDS } from './service-status-words';

/** The older template's wording for each status, as the office and the template know it. */
const TEMPLATE_STATUS = { in_progress: 'being worked on', booked: 'visit booked' } as const;

const LOCALE = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' } as const;

/**
 * Progress news on a service request ("being worked on", "visit booked"). With the chat window open and
 * no STOP it is a plain message in the customer's language, named with the category in their words (the
 * template's Settings switch governs the template, not chat replies). Otherwise the approved
 * `service_update` template goes as before. Returns where it went.
 */
export async function tellServiceStatus(
  tx: DatabaseExecutor,
  request: {
    readonly id: string;
    readonly category: string;
    /** The English topic the template carries. */
    readonly topic: string;
    readonly customer: { readonly name: string; readonly phone: string };
  },
  status: keyof typeof TEMPLATE_STATUS,
  now: Date,
  /** The visit day (YYYY-MM-DD) for "booked". */
  day?: string,
): Promise<'chat' | 'template'> {
  const { phone, name } = request.customer;
  const key = `service:${request.id}:${status}:${now.getTime()}`;
  const payload = { customer: name, topic: request.topic, status: TEMPLATE_STATUS[status] };
  if (!(await chatOpenFor(tx, phone))) {
    await queueWhatsApp(tx, phone, 'service_update', payload, key);
    return 'template';
  }
  const language = await languageOfPhone(tx, phone);
  const body = await inLanguage(language, async () => {
    const topic = CATEGORY_WORDS[request.category] ?? request.topic;
    if (status === 'in_progress') return SERVICE_STATUS_WORDS.inProgress(topic);
    const when = day
      ? new Date(`${day}T00:00:00Z`).toLocaleDateString(LOCALE[language], {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })
      : '';
    return SERVICE_STATUS_WORDS.booked(topic, when);
  });
  const chat = await conversationForPhone(tx, phone);
  await queueReply(tx, chat, { kind: 'text', body }, null, key);
  await noticeCustomer(tx, phone, 'service_update', payload, key);
  return 'chat';
}
