import type { MessageTemplateDefault } from './message-templates';

/**
 * The customer templates behind the subsidy, loan and layout steps (redesign §4, §18 11, 15; phase 4b):
 * sent only when the chat's 24-hour window is closed, and off until Meta has approved them in
 * English, Marathi and Hindi (docs/whatsapp-templates.md 42-48).
 */
export const STEP_ASK_TEMPLATES = [
  {
    key: 'subsidy_register_help',
    audience: 'customer',
    fields: ['customer', 'home'],
    extras: { quickReplies: ['donePayload', 'helpPayload'] },
    preview:
      'Hello {{1}}, please register on the PM Surya Ghar portal (pmsuryaghar.gov.in) for your {{2}} solar. It takes about 5 minutes. Tell us when it is done, or ask for help.',
  },
  {
    key: 'subsidy_credit_check',
    audience: 'customer',
    fields: ['customer', 'amount', 'home'],
    extras: { quickReplies: ['yesPayload', 'notYetPayload'] },
    preview: 'Hello {{1}}, did the {{2}} subsidy for your {{3}} solar reach your bank account?',
  },
  {
    key: 'bank_sign_visit',
    audience: 'customer',
    fields: ['customer', 'bank', 'branch', 'day'],
    extras: { quickReplies: ['goPayload', 'changePayload'] },
    preview:
      'Hello {{1}}, please visit {{2}}, {{3}} on {{4}} to sign the loan papers for your solar.',
  },
  {
    key: 'layout_approval',
    audience: 'customer',
    fields: ['customer', 'home'],
    // The layout rides as the document header; [Looks good] is logged, [I have a question] goes to a person.
    extras: {
      document: { urlField: 'documentUrl', nameField: 'documentName' },
      quickReplies: ['okPayload', 'questionPayload'],
    },
    preview:
      'Hello {{1}}, here is how the panels will sit on your {{2}} roof. Tap Looks good if you are happy, or ask us if you have a question.',
  },
  {
    key: 'loan_sanctioned',
    audience: 'customer',
    fields: ['customer', 'amount', 'bank'],
    preview:
      'Hello {{1}}, good news: your loan of {{2}} is sanctioned by {{3}}. We will guide you on the next steps.',
  },
  {
    key: 'loan_disbursed',
    audience: 'customer',
    fields: ['customer', 'amount', 'bank'],
    preview: 'Hello {{1}}, {{2}} was sent by {{3}} for your solar. Thank you.',
  },
  {
    key: 'loan_rejected',
    audience: 'customer',
    fields: ['customer', 'bank', 'staff'],
    preview:
      'Hello {{1}}, {{2}} did not approve the loan. {{3}} will call you to plan the next steps.',
  },
] as const satisfies readonly MessageTemplateDefault[];
