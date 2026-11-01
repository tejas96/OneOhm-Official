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
