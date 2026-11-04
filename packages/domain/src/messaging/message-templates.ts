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
  /**
   * What the Meta-approved version with a file and buttons adds. Each value names a payload
   * field. Sent only while the template's "extras approved" switch is on in Settings.
   */
  readonly extras?: {
    readonly document?: { readonly urlField: string; readonly nameField: string };
    /** Payload field names, in button order. */
    readonly quickReplies?: readonly string[];
    /** The payload field holding the URL button's suffix. */
    readonly urlButton?: string;
  };
}

export const DEFAULT_MESSAGE_TEMPLATES = [
  {
    key: 'quotation_sent',
    audience: 'customer',
    fields: ['customer', 'number', 'total', 'subsidy', 'effective'],
    extras: {
      document: { urlField: 'documentUrl', nameField: 'documentName' },
      quickReplies: ['acceptPayload', 'askPayload'],
    },
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
    key: 'project_manager_changed',
    audience: 'customer',
    fields: ['customer', 'project', 'manager', 'phone'],
    preview:
      'Hello {{1}}, your solar project {{2}} now has a new project manager: {{3}}. You can reach them on {{4}}. Reply here if you have any questions.',
  },
  {
    key: 'payment_received',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project'],
    extras: { document: { urlField: 'documentUrl', nameField: 'documentName' } },
    preview:
      'Hello {{1}}, we received your payment of {{2}} for {{3}} on your solar project {{4}}. Thank you. You can see all your payments in the OneOhm app.',
  },
  {
    key: 'payment_reminder',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project'],
    extras: { urlButton: 'payToken' },
    preview:
      'Hello {{1}}, {{2}} for {{3}} on project {{4}} is due. Please pay at your convenience. If you have already paid, please ignore this message.',
  },
  {
    key: 'payment_link',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project', 'link'],
    extras: { urlButton: 'payToken' },
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
    key: 'contact_changed',
    audience: 'customer',
    fields: ['customer', 'staff', 'subject', 'phone'],
    preview:
      'Hi {{1}}, {{2}} is now your OneOhm contact for {{3}}. You can call them on {{4}}, or reply here any time.',
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
    key: 'paper_request',
    audience: 'customer',
    fields: ['customer', 'document', 'home'],
    preview:
      'Hello {{1}}, please send your {{2}} for your solar at {{3}}. Reply here with a clear photo or PDF. You can also send it from the OneOhm app.',
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
  {
    key: 'staff_welcome',
    audience: 'staff',
    fields: ['name', 'link'],
    preview:
      'Hi {{1}}, you have been added to the OneOhm team. Open the app here: {{2}}. Sign in with this mobile number. For the website, choose "First time here?" to set your password.',
  },
] as const satisfies readonly MessageTemplateDefault[];

/** The file and buttons a message can add once Meta approves them, if it has any. */
export function templateExtras(key: string): MessageTemplateDefault['extras'] {
  return (DEFAULT_MESSAGE_TEMPLATES as readonly MessageTemplateDefault[]).find(
    (template) => template.key === key,
  )?.extras;
}

/**
 * The details a message's senders fill, so the only names its fields may use: a field the
 * sender does not fill makes every send of that message fail. Null for a message OneOhm
 * does not ship, whose sender this list cannot know.
 */
export function messageFieldsFor(key: string): readonly string[] | null {
  return (
    (DEFAULT_MESSAGE_TEMPLATES as readonly MessageTemplateDefault[]).find(
      (template) => template.key === key,
    )?.fields ?? null
  );
}

/** The field names a message cannot fill, in the order given. */
export function unknownMessageFields(key: string, fields: readonly string[]): string[] {
  const known = messageFieldsFor(key);
  return known ? fields.filter((field) => !known.includes(field)) : [];
}

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
