import type { MessageTemplateDefault } from './message-templates';

/**
 * The customer templates behind the staff "Send to customer" menu (redesign §18): each goes
 * out only when the chat's 24-hour window is closed (inside it the same news is a chat message),
 * and starts off until Meta has approved it in English, Marathi and Hindi.
 */
export const SEND_MESSAGE_TEMPLATES = [
  {
    key: 'location_request',
    audience: 'customer',
    fields: ['customer', 'home'],
    // The button opens the chat step that sends the 📍 Send location message (inside 24 hours).
    extras: { quickReplies: ['locationPayload'] },
    preview:
      'Hello {{1}}, please share the location of your {{2}} home so our team finds it easily. Tap the button below to send it.',
  },
  {
    key: 'payment_due',
    audience: 'customer',
    fields: ['customer', 'amount', 'home'],
    // [Pay now] answers with the pay-link message; [I paid another way] opens the proof form.
    extras: { quickReplies: ['payPayload', 'paidPayload'] },
    preview:
      'Hello {{1}}, {{2}} is due for your {{3}} home. You can pay online, or tell us if you have already paid another way.',
  },
  {
    key: 'callback_request',
    audience: 'customer',
    fields: ['customer', 'staff'],
    extras: { quickReplies: ['morningPayload', 'afternoonPayload', 'eveningPayload'] },
    preview: 'Hello {{1}}, when should {{2}} from OneOhm call you? Pick a time below.',
  },
  {
    key: 'delay_notice',
    audience: 'customer',
    fields: ['customer', 'stage', 'reason'],
    preview: 'Hello {{1}}, your {{2}} is waiting: {{3}}. We will update you here.',
  },
  {
    key: 'crew_contact',
    audience: 'customer',
    fields: ['customer', 'staff', 'work', 'phone'],
    preview: 'Hello {{1}}, {{2}} from OneOhm will come for your {{3}}. You can call them on {{4}}.',
  },
  {
    key: 'document_share',
    audience: 'customer',
    fields: ['customer', 'document'],
    extras: { document: { urlField: 'documentUrl', nameField: 'documentName' } },
    preview: 'Hello {{1}}, here is your {{2}} from OneOhm. Reply here if you have any questions.',
  },
  {
    key: 'visit_pick',
    audience: 'customer',
    fields: ['customer', 'home', 'work'],
    // The button opens the chat step with the list of free days.
    extras: { quickReplies: ['pickPayload'] },
    preview:
      'Hello {{1}}, when can our team visit {{2}} for the {{3}}? Tap the button below to pick a day.',
  },
  {
    key: 'visit_booked',
    audience: 'customer',
    fields: ['customer', 'when', 'staff'],
    extras: { quickReplies: ['okayPayload', 'changePayload'] },
    preview: 'Hello {{1}}, your visit is booked ✅ {{2}}. {{3}} will call before coming.',
  },
  {
    key: 'visit_reminder',
    audience: 'customer',
    fields: ['customer', 'home', 'when', 'work'],
    extras: { quickReplies: ['confirmPayload', 'changePayload'] },
    preview: 'Hello {{1}}, our team visits {{2}} {{3}} for the {{4}}. Please confirm.',
  },
  {
    key: 'inspection_presence',
    audience: 'customer',
    fields: ['customer', 'work', 'home', 'day'],
    extras: { quickReplies: ['confirmPayload', 'changePayload'] },
    preview:
      'Hello {{1}}, the electricity board (DISCOM) will do the {{2}} at {{3}} on {{4}}. Please be at home.',
  },
] as const satisfies readonly MessageTemplateDefault[];

/**
 * Whether a template is on, from its settings row. One rule for the staff preview and the worker's
 * send, so they never disagree. A row says so itself. With no row (a database not migrated yet) the
 * templates behind "Send to customer", which Meta has not approved, are off, and the older built-in
 * ones keep sending as they always did.
 */
export function templateIsOn(key: string, row: { readonly active: boolean } | null | undefined) {
  if (row) return row.active;
  return !SEND_MESSAGE_TEMPLATES.some((template) => template.key === key);
}
