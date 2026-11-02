import { STEP_MESSAGE_TEMPLATES } from './customer-steps';

/**
 * Business-initiated WhatsApp messages use templates approved in Meta's WhatsApp
 * Manager (PRD 6.2, 7.2). These are the defaults; owners can change the Meta name,
 * language, field order and wording in Settings. `fields` fill {{1}}, {{2}}… in order.
 */
export interface MessageTemplateDefault {
  readonly key: string;
  readonly audience: 'customer' | 'staff';
  readonly fields: readonly string[];
  readonly preview: string;
}

export const DEFAULT_MESSAGE_TEMPLATES = [
  {
    key: 'quotation_sent',
    audience: 'customer',
    fields: ['customer', 'number', 'total', 'subsidy', 'effective'],
    preview:
      'Hello {{1}}, your OneOhm solar quotation {{2}} is ready. Total price: {{3}}. Expected government subsidy: {{4}}. Your cost after subsidy: {{5}}. Reply here if you have any questions.',
  },
  {
    key: 'project_started',
    audience: 'customer',
    fields: ['customer', 'project', 'capacity'],
    preview:
      'Hello {{1}}, your solar project {{2}} ({{3}}) has started. We will keep you posted here.',
  },
  {
    key: 'project_milestone',
    audience: 'customer',
    fields: ['customer', 'project', 'milestone'],
    preview:
      'Hello {{1}}, an update on your solar project {{2}}: {{3}}. We will keep you posted here.',
  },
  {
    key: 'payment_received',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project'],
    preview:
      'Hello {{1}}, we received your payment of {{2}} for {{3}} on your solar project {{4}}. Thank you. You can see all your payments in the OneOhm app.',
  },
  {
    key: 'payment_reminder',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project'],
    preview:
      'Hello {{1}}, {{2}} for {{3}} on project {{4}} is due. Please pay at your convenience. If you have already paid, please ignore this message.',
  },
  {
    key: 'payment_link',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project', 'link'],
    preview:
      'Hello {{1}}, please pay {{2}} for {{3}} on project {{4}}. Pay securely here: {{5}} Reply here if you need help.',
  },
  {
    key: 'service_update',
    audience: 'customer',
    fields: ['customer', 'topic', 'status'],
    preview:
      'Hello {{1}}, your service request "{{2}}" is now {{3}}. We will keep you posted here.',
  },
  {
    key: 'change_request_raised',
    audience: 'customer',
    fields: ['customer', 'request', 'number'],
    preview:
      'Hello {{1}}, we have started your {{2}} request ({{3}}). We will tell you when it is complete.',
  },
  {
    key: 'change_request_completed',
    audience: 'customer',
    fields: ['customer', 'request', 'number'],
    preview: 'Hello {{1}}, your {{2}} request ({{3}}) is complete. Thank you for your patience.',
  },
  {
    key: 'document_requested',
    audience: 'customer',
    fields: ['customer', 'document', 'project'],
    preview:
      'Hello {{1}}, please send your {{2}} for project {{3}}. Open the OneOhm app, go to Documents and tap Send.',
  },
  {
    key: 'referral_reward',
    audience: 'customer',
    fields: ['customer', 'friend', 'amount', 'status'],
    preview: 'Hello {{1}}, your OneOhm referral reward for {{2}} ({{3}}) is {{4}}. Thank you!',
  },
  {
    key: 'maintenance_visit',
    audience: 'customer',
    fields: ['customer', 'visit', 'date', 'project'],
    preview:
      'Hello {{1}}, your free {{2}} visit is on {{3}}, for project {{4}}. Our service team will call before they come.',
  },
  {
    key: 'survey_scheduled',
    audience: 'customer',
    fields: ['customer', 'project', 'date'],
    preview:
      'Hello {{1}}, our team will visit for the site survey of your solar project {{2}} on {{3}}. They will call before they come.',
  },
  {
    key: 'stage_rating_request',
    audience: 'customer',
    fields: ['customer', 'stage', 'project'],
    preview:
      'Hello {{1}}, the {{2}} for your solar project {{3}} is done. How did we do? Please rate it in the OneOhm app.',
  },
  ...STEP_MESSAGE_TEMPLATES,
  {
    // A team member writes after WhatsApp's 24-hour window closed; their words go in {{3}}.
    key: 'chat_follow_up',
    audience: 'customer',
    fields: ['customer', 'staff', 'message'],
    preview:
      'Hello {{1}}, you have a new message from {{2}} at OneOhm: "{{3}}" Please reply here to continue the chat.',
  },
  {
    key: 'staff_daily_digest',
    audience: 'staff',
    fields: ['name', 'overdue', 'today', 'followUps'],
    preview:
      'Good morning {{1}}, here is your OneOhm work summary for today. Overdue tasks: {{2}}. Tasks due today: {{3}}. Lead follow-ups: {{4}}. Open the OneOhm app to see them.',
  },
] as const satisfies readonly MessageTemplateDefault[];

/** Fields a task's customer message can fill; templates needing others cannot be picked. */
export const TASK_MESSAGE_FIELDS = [
  'customer',
  'project',
  'milestone',
  'capacity',
  // The task's report or paper link, when the template attaches one (PRD 6.2).
  'link',
] as const;

/** When a task's customer message goes out. */
export const TASK_NOTIFY_EVENTS = ['started', 'completed', 'approved'] as const;
export type TaskNotifyEvent = (typeof TASK_NOTIFY_EVENTS)[number];

/** Fills {{1}}, {{2}}… with the fields in order, for previews and the in-app copy. */
export function renderTemplate(
  preview: string,
  fields: readonly string[],
  values: Readonly<Record<string, string>>,
): string {
  return preview.replace(/\{\{(\d+)\}\}/g, (match, index: string) => {
    const field = fields[Number(index) - 1];
    return field ? (values[field] ?? match) : match;
  });
}

/** The longest staff message a follow-up template carries; WhatsApp caps the whole body. */
export const FOLLOW_UP_MAX = 700;

/**
 * A staff message made fit for a template field: WhatsApp refuses line breaks, tabs and
 * long runs of spaces there, so the message becomes one tidy line, cut to FOLLOW_UP_MAX.
 */
export function followUpText(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= FOLLOW_UP_MAX ? line : `${line.slice(0, FOLLOW_UP_MAX - 1).trimEnd()}…`;
}
