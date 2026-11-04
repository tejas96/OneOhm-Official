/**
 * How OneOhm reaches a customer (owner's rule): WhatsApp first; SMS when they are not on
 * WhatsApp; in person (papers handed over by the team) when neither works.
 */
export const CONTACT_CHANNELS = ['whatsapp', 'sms', 'in_person'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** Meta's code for "this number is not on WhatsApp" (message undeliverable). */
export const NOT_ON_WHATSAPP_CODES: readonly number[] = [131026];

export const isNotOnWhatsApp = (code: number | null | undefined): boolean =>
  code !== null && code !== undefined && NOT_ON_WHATSAPP_CODES.includes(code);

/** The channel one message goes out on, from the customer's setting and what we learnt. */
export function routeFor(customer: {
  readonly channel: ContactChannel;
  /** WhatsApp told us the number is not on WhatsApp. */
  readonly whatsappUnreachable: boolean;
  /** The customer asked for no WhatsApp messages. */
  readonly whatsappOptIn: boolean;
}): ContactChannel {
  if (customer.channel !== 'whatsapp') return customer.channel;
  if (customer.whatsappUnreachable || !customer.whatsappOptIn) return 'sms';
  return 'whatsapp';
}

/**
 * STOP means "no WhatsApp", not "tell me nothing": money, visits and project steps still
 * go by SMS. These nice-to-have messages are not sent at all to a customer who said STOP.
 */
export const SKIPPED_AFTER_STOP: readonly string[] = [
  'stage_rating_request',
  'referral_reward',
  'contact_changed',
];

export const skippedAfterStop = (template: string, whatsappOptIn: boolean): boolean =>
  !whatsappOptIn && SKIPPED_AFTER_STOP.includes(template);

/** Longest SMS text: two standard parts, so it stays cheap and reads in one glance. */
export const SMS_MAX = 300;

/**
 * The SMS version of a message: one plain line, signed with the company's name from its
 * profile (no sign when there is none yet), never cut mid-word.
 */
export function smsText(title: string, body: string, brand: string): string {
  const sign = brand.trim() ? ` - ${brand.trim()}` : '';
  // A title that already ends a sentence ("How did we do?") gets no extra full stop.
  const head = title.trim();
  const joiner = /[.?!:]$/.test(head) ? ' ' : '. ';
  const text = [head, body.trim()].filter(Boolean).join(joiner).replace(/\s+/g, ' ');
  const room = SMS_MAX - sign.length;
  if (text.length <= room) return `${text}${sign}`;
  const cut = text.slice(0, room - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))}…${sign}`;
}

/**
 * Whether the team is asked to tell a customer in person. Not when the owner turned the
 * message off in Settings: the team would be chasing news nobody wants sent.
 */
export const handsOverInPerson = (route: ContactChannel, messageOn: boolean): boolean =>
  route === 'in_person' && messageOn;
