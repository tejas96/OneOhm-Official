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
      'Hello {{1}}, your OneOhm solar quotation {{2}} is ready. Price {{3}}, expected subsidy {{4}}, you pay {{5}}.',
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
    preview: 'Hello {{1}}, an update on your solar project {{2}}: {{3}}.',
  },
  {
    key: 'payment_received',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project'],
    preview: 'Hello {{1}}, we received {{2}} for {{3}} on project {{4}}. Thank you.',
  },
  {
    key: 'payment_reminder',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project'],
    preview:
      'Hello {{1}}, {{2}} for {{3}} on project {{4}} is due. Please pay at your convenience.',
  },
  {
    key: 'payment_link',
    audience: 'customer',
    fields: ['customer', 'amount', 'milestone', 'project', 'link'],
    preview: 'Hello {{1}}, please pay {{2}} for {{3}} on project {{4}} here: {{5}}',
  },
  {
    key: 'service_update',
    audience: 'customer',
    fields: ['customer', 'topic', 'status'],
    preview: 'Hello {{1}}, your service request "{{2}}" is now {{3}}.',
  },
  {
    key: 'change_request_raised',
    audience: 'customer',
    fields: ['customer', 'request', 'number'],
    preview: 'Hello {{1}}, we have started your {{2}} request ({{3}}).',
  },
  {
    key: 'change_request_completed',
    audience: 'customer',
    fields: ['customer', 'request', 'number'],
    preview: 'Hello {{1}}, your {{2}} request ({{3}}) is complete.',
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
      'Hello {{1}}, your free {{2}} visit for {{4}} is on {{3}}. Our service team will call before they come.',
  },
  {
    key: 'staff_daily_digest',
    audience: 'staff',
    fields: ['name', 'overdue', 'today', 'followUps'],
    preview: 'Good morning {{1}}. Overdue tasks: {{2}}. Due today: {{3}}. Lead follow-ups: {{4}}.',
  },
] as const satisfies readonly MessageTemplateDefault[];

/** Fields a task's customer message can fill; templates needing others cannot be picked. */
export const TASK_MESSAGE_FIELDS = ['customer', 'project', 'milestone', 'capacity'] as const;

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
