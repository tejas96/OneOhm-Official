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

/**
 * What an automatic customer message becomes for a customer not on WhatsApp, by template (the same
 * rule as `sendPath` for the staff menu):
 * - `never`: marketing (cost, optional) is never sent by SMS;
 * - `skip`: a reminder of an answer only the WhatsApp chat can take (the first ask was handed over);
 * - `in_person`: the first ask of such an answer - one "Do in person" task for the team;
 * - `sms`: it goes as an SMS text in the usual words (which point to the app or the team).
 */
export type TemplatePath = 'never' | 'skip' | 'in_person' | 'sms';

const MARKETING: readonly string[] = [
  'self_survey_offer',
  'self_survey_reminder',
  'amc_renewal_offer',
];
/** Reminders whose words send the customer to the WhatsApp chat. */
const CHAT_REMINDERS: readonly string[] = [
  'visit_reminder',
  'signature_reminder',
  'signed_page_reminder',
  'site_ready_reminder',
  'layout_reminder',
];
/** First asks that only the WhatsApp chat can take: a pin, a pick, a signature, a confirmation, a UPI ID. */
const CHAT_ASKS: readonly string[] = [
  'location_request',
  'callback_request',
  'visit_pick',
  'signature_request',
  'site_ready_check',
  'installation_check',
  'reward_upi_ask',
  'subsidy_register_help',
  'subsidy_credit_check',
  'bank_sign_visit',
  'layout_approval',
];

export function offWhatsAppPathForTemplate(template: string): TemplatePath {
  if (MARKETING.includes(template)) return 'never';
  if (CHAT_REMINDERS.includes(template)) return 'skip';
  return CHAT_ASKS.includes(template) ? 'in_person' : 'sms';
}

/** The team's task for something done with a customer who is not on WhatsApp. */
export const inPersonTask = (customer: string, what: string) => ({
  title: `Do in person: ${what}`,
  body: `${customer} is not on WhatsApp: ${what} with them in person.`,
});

/** Messages whose SMS words differ from the app inbox (the app words point to the WhatsApp chat). */
export const SMS_WORDS_OF: Readonly<Record<string, string>> = {
  problem_fixed_check: 'problem_fixed_sms',
};
