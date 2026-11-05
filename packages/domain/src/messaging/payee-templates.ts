import type { MessageTemplateDefault } from './message-templates';

/**
 * WhatsApp messages to vendors and crews, who are not customers. Off until Meta approves
 * the template and the owner switches it on in Settings → Messages.
 */
export const PAYEE_MESSAGE_TEMPLATES = [
  {
    // Sent by itself when a bank transfer of a bill is done (RazorpayX payouts, PRD 3.11).
    key: 'vendor_paid',
    audience: 'vendor',
    fields: ['payee', 'amount', 'company', 'utr', 'date', 'last4'],
    preview:
      'Hello {{1}}, {{3}} has paid you {{2}} by bank transfer on {{5}}. Bank reference (UTR): {{4}}. It went to the account ending {{6}}.',
  },
] as const satisfies readonly MessageTemplateDefault[];

/** The template's key, shared by the sender and the Settings switch. */
export const PAYEE_PAID_TEMPLATE = 'vendor_paid';
