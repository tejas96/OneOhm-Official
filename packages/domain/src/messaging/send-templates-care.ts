import type { MessageTemplateDefault } from './message-templates';

/**
 * The customer templates behind problems, rewards and the AMC (redesign §4, §12, §15; phase 6): sent
 * only when the chat's 24-hour window is closed, and off until Meta has approved them in English,
 * Marathi and Hindi (docs/whatsapp-templates.md 53-55).
 */
export const CARE_TEMPLATES = [
  {
    // After a service request is resolved: "Is it working now?"
    key: 'problem_fixed_check',
    audience: 'customer',
    fields: ['customer', 'topic'],
    extras: { quickReplies: ['yesPayload', 'stillPayload'] },
    preview: 'Hello {{1}}, we have fixed "{{2}}". Is it working now? Tap a button to tell us.',
  },
  {
    // Reward approved: the button opens the "Share your UPI ID" form.
    key: 'reward_upi_ask',
    audience: 'customer',
    fields: ['customer', 'amount'],
    extras: { quickReplies: ['sharePayload'] },
    preview:
      'Hello {{1}}, your OneOhm referral reward of {{2}} is approved. Share your UPI ID to receive it.',
  },
  {
    // Marketing: 30 days before the AMC ends; skipped after STOP.
    key: 'amc_renewal_offer',
    audience: 'customer',
    fields: ['customer', 'home', 'date'],
    extras: { quickReplies: ['renewPayload', 'talkPayload'] },
    preview:
      'Hello {{1}}, the annual maintenance plan for your {{2}} solar ends on {{3}}. Renew it to keep your free visits and cleaning.',
  },
] as const satisfies readonly MessageTemplateDefault[];
