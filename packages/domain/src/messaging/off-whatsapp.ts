import type { ContactChannel } from './contact-channels';
import type { SendAction } from './send-to-customer';

/**
 * Customers not on WhatsApp (redesign §17, about 2%): what each "Send to customer" action becomes for
 * them. A paper or a rating goes as an SMS pointing to the OneOhm app or the team; a payment goes as an
 * SMS with the pay link; everything that needs a pin, a signature, a pick or a confirmation is done in
 * person (a task for the owner on the customer handovers list). A customer on neither (channel "in
 * person") gets everything in person.
 */
export type SendPath = 'whatsapp' | 'sms_text' | 'sms_pay_link' | 'in_person';

const APP_OR_SMS: readonly SendAction[] = ['ask_paper', 'ask_rating'];
const PAY_LINK: readonly SendAction[] = ['payment_reminder'];
/** News with nothing to answer: the SMS says it in a line, or the team hands it over. */
const NEWS: readonly SendAction[] = [
  'send_document',
  'send_receipt',
  'share_crew',
  'delay_notice',
  'send_handover_pack',
  'send_layout',
];

/** News with nothing to answer: it keeps the usual route (the approved message's SMS or the handovers list). */
export const isNews = (action: SendAction): boolean => NEWS.includes(action);

/** The path one action takes for a customer reached by `route`. */
export function sendPath(action: SendAction, route: ContactChannel): SendPath {
  if (route === 'whatsapp') return 'whatsapp';
  if (route === 'in_person') return 'in_person';
  if (PAY_LINK.includes(action)) return 'sms_pay_link';
  if (APP_OR_SMS.includes(action) || NEWS.includes(action)) return 'sms_text';
  return 'in_person';
}

/** The channel recorded on the customer action: how the ask actually travels. */
export const channelOf = (path: SendPath): ContactChannel =>
  path === 'whatsapp' ? 'whatsapp' : path === 'in_person' ? 'in_person' : 'sms';
