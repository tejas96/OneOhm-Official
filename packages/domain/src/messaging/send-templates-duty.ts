import type { MessageTemplateDefault } from './message-templates';

/**
 * The customer templates of a site visit (Duty Day step 6): sent only when the chat's 24-hour
 * window is closed (inside it the same news is a chat message), and off until Meta has approved
 * them in English, Marathi and Hindi (docs/whatsapp-templates.md 57-60).
 */
export const DUTY_VISIT_TEMPLATES = [
  {
    // The worker is coming closer to the site; the button opens the live map page.
    key: 'worker_on_way',
    audience: 'customer',
    fields: ['customer', 'worker', 'home', 'minutes'],
    extras: { urlButton: 'trackToken' },
    preview: 'Hello {{1}}, {{2}} from OneOhm is on the way to {{3}}. Expected in about {{4}} min.',
  },
  {
    // The worker checked in at the site (by hand or by the fence).
    key: 'worker_arrived',
    audience: 'customer',
    fields: ['customer', 'worker', 'home'],
    preview: 'Hello {{1}}, {{2}} from OneOhm has reached {{3}}.',
  },
  {
    // At check-out: the customer's tap is the strongest visit proof.
    key: 'visit_check',
    audience: 'customer',
    fields: ['customer', 'worker', 'home'],
    extras: { quickReplies: ['yesPayload', 'noPayload'] },
    preview: 'Hello {{1}}, {{2}} from OneOhm visited {{3}} today. Was this visit done?',
  },
  {
    // A planned visit is 30 minutes past its start and nobody has arrived.
    key: 'visit_delayed',
    audience: 'customer',
    fields: ['customer', 'home'],
    preview:
      'Hello {{1}}, our team is running late for your visit to {{2}}. We will update you soon.',
  },
] as const satisfies readonly MessageTemplateDefault[];
