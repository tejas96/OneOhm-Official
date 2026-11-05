import type { MessageTemplateDefault } from './message-templates';
import { CARE_TEMPLATES } from './send-templates-care';
import { STEP_ASK_TEMPLATES } from './send-templates-steps';

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
  {
    key: 'signature_request',
    audience: 'customer',
    fields: ['customer', 'document', 'home'],
    // The paper rides as the document header; [I agree] logs the agreement, [I have a question] goes to a person.
    extras: {
      document: { urlField: 'documentUrl', nameField: 'documentName' },
      quickReplies: ['agreePayload', 'questionPayload'],
    },
    preview:
      'Hello {{1}}, please read your {{2}} for {{3}}. Tap I agree if you accept it, or ask us if you have a question.',
  },
  {
    key: 'site_ready_check',
    audience: 'customer',
    fields: ['customer', 'home'],
    extras: { quickReplies: ['yesPayload', 'notYetPayload'] },
    preview:
      'Hello {{1}}, is the roof at {{2}} ready for installation? It needs a clear roof, a power point and someone at home.',
  },
  {
    key: 'installation_check',
    audience: 'customer',
    fields: ['customer', 'home'],
    extras: { quickReplies: ['yesPayload', 'wrongPayload'] },
    preview: 'Hello {{1}}, is the installation at {{2}} finished to your satisfaction?',
  },
  {
    key: 'handover_pack',
    audience: 'customer',
    fields: ['customer', 'count', 'home'],
    // [Documents] opens the chat step that sends the papers; [Warranty & AMC] shows the warranty answer.
    extras: { quickReplies: ['documentsPayload', 'warrantyPayload'] },
    preview:
      'Hello {{1}}, your {{2}} handover papers for {{3}} are ready. Tap Documents to receive them here.',
  },
  {
    key: 'signature_reminder',
    audience: 'customer',
    fields: ['customer', 'document', 'home'],
    // The button runs the same step as the tap in the waiting message: the paper again, with its two buttons.
    extras: { quickReplies: ['showPayload'] },
    preview:
      'Hello {{1}}, a reminder: please read your {{2}} for {{3}} and tell us if you agree. Tap the button to see it again.',
  },
  {
    key: 'signed_page_reminder',
    audience: 'customer',
    fields: ['customer', 'document', 'home'],
    // The customer agreed, but the signed page was cancelled or never came: the button asks for it again.
    extras: { quickReplies: ['showPayload'] },
    preview:
      'Hello {{1}}, please send the signed page of your {{2}} for {{3}} again. Tap the button to send it.',
  },
  {
    key: 'site_ready_reminder',
    audience: 'customer',
    fields: ['customer', 'home'],
    extras: { quickReplies: ['readyNowPayload'] },
    preview:
      'Hello {{1}}, we are waiting for the roof at {{2}} to be ready for installation. Tap the button when it is ready.',
  },
  ...STEP_ASK_TEMPLATES,
  ...CARE_TEMPLATES,
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
