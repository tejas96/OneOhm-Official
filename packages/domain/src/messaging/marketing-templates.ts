import type { MessageTemplateDefault } from './message-templates';

/**
 * WhatsApp marketing messages (Meta category MARKETING), sent from Marketing to the business's own
 * contacts and to finished customers for a Google review. Off until Meta approves them; Marketing
 * → Connections sends them for approval and switches each on once approved. The offers carry the
 * campaign photo on top once Meta approves the version with an image.
 */
export const MARKETING_MESSAGE_TEMPLATES = [
  {
    key: 'offer_quote_follow_up',
    audience: 'customer',
    fields: ['customer', 'company', 'message'],
    extras: { image: { urlField: 'imageUrl' } },
    preview:
      'Hello {{1}}, your solar quotation from {{2}} is still open. {{3}} Reply here and we will help you choose. Reply STOP to stop these messages.',
  },
  {
    key: 'offer_revisit',
    audience: 'customer',
    fields: ['customer', 'company', 'message'],
    extras: { image: { urlField: 'imageUrl' } },
    preview:
      'Hello {{1}}, {{2}} here. Solar prices and subsidy have changed since we last spoke. {{3}} Reply YES and we will call you. Reply STOP to stop these messages.',
  },
  {
    key: 'offer_past_customer',
    audience: 'customer',
    fields: ['customer', 'company', 'message'],
    extras: { image: { urlField: 'imageUrl' } },
    preview:
      'Hello {{1}}, thank you for choosing {{2}} for your solar. {{3}} Reply here to know more. Reply STOP to stop these messages.',
  },
  {
    key: 'review_request',
    audience: 'customer',
    fields: ['customer', 'company', 'link'],
    preview:
      'Hello {{1}}, your solar system from {{2}} is working. Could you spare one minute to rate us on Google? It helps other families choose solar: {{3}}',
  },
] as const satisfies readonly MessageTemplateDefault[];

/** The marketing message keys: shown in Marketing, not in Settings → Messages. */
export const MARKETING_TEMPLATE_KEYS: readonly string[] = [
  ...MARKETING_MESSAGE_TEMPLATES.map((template) => template.key),
  // Older marketing messages, sent by their own flows.
  'self_survey_offer',
  'self_survey_reminder',
  'amc_renewal_offer',
];

/** WhatsApp refuses new lines and long runs of spaces inside a template field. */
export function templateFieldText(text: string, max = 900): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
