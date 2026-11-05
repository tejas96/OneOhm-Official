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
      'Hello {{1}}, please register on the PM Surya Ghar portal (pmsuryaghar.gov.in) for your {{2}} solar. It takes about 5 minutes. Keep your latest electricity bill (consumer number, electricity company) and an email ID ready. Tell us when it is done, or ask for help.',
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
    key: 'layout_reminder',
    audience: 'customer',
    fields: ['customer', 'home'],
    // The button shows the layout again with its two buttons (the same step as the tap in a waiting message).
    extras: { quickReplies: ['showPayload'] },
    preview:
      'Hello {{1}}, a reminder: please look at how the panels will sit on your {{2}} roof and tell us if it looks good. Tap the button to see it again.',
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
  {
    // Marketing (a discount offer): skipped after STOP.
    key: 'self_survey_offer',
    audience: 'customer',
    fields: ['customer', 'home', 'amount'],
    extras: { quickReplies: ['startPayload', 'visitPayload'] },
    preview:
      'Hello {{1}}, do your own site survey for your {{2}} solar in 5 minutes and get {{3}} off your next payment. Our engineer checks your photos - no visit needed.',
  },
  {
    // Marketing: the 2-day reminder of a survey offered or started and not sent.
    key: 'self_survey_reminder',
    audience: 'customer',
    fields: ['customer', 'home'],
    extras: { quickReplies: ['continuePayload'] },
    preview:
      'Hello {{1}}, a reminder: your site survey for your {{2}} solar is not finished yet. It takes about 5 minutes. Tap the button to continue.',
  },
  {
    key: 'self_survey_approved',
    audience: 'customer',
    fields: ['customer', 'home', 'amount'],
    preview: 'Hello {{1}}, your site survey for your {{2}} solar is approved. {{3}}',
  },
] as const satisfies readonly MessageTemplateDefault[];
