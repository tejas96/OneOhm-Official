import { OTHER_DISCOM_CUSTOMER_TITLES } from '../tasks/task-library-discoms';
import type { MessageTemplateDefault } from './message-templates';

/**
 * Each project step in the customer's words (PRD 5.2: "customers see understandable
 * milestones, never internal task terminology"). The same English as the customer app;
 * staff see the task's own title. Seeded as each task template's customer title.
 */
export const CUSTOMER_STEP_TITLES: Readonly<Record<string, string>> = {
  site_survey: 'Site visit and roof measurements',
  site_survey_society: 'Site visit and roof measurements',
  site_survey_commercial: 'Site visit and roof measurements',
  site_survey_ground: 'Site visit and land measurements',
  name_change: 'Electricity connection name change',
  system_design: 'Your system design is approved',
  loan_approval: 'Bank loan sanctioned',
  discom_application: 'Net-meter application filed with the electricity board',
  dispatch_material: 'Equipment on its way to your home',
  structure_installation: 'Mounting structure fitted',
  installation_complete: 'Installation finished and checked',
  testing_commissioning: 'System tested and switched on',
  discom_inspection: 'Electricity board inspection',
  net_meter_installation: 'Net meter fitted',
  handover: 'Handover and warranty papers',
  subsidy_application: 'Subsidy applied on the PM Surya Ghar portal',
  subsidy_inspection: 'Subsidy inspection approved',
  subsidy_release: 'Subsidy released to your bank account',
  ...OTHER_DISCOM_CUSTOMER_TITLES,
};

/**
 * Steps whose customer message is not the plain "update on your project" (PRD 6.2
 * examples): installation tells the customer when it starts, and switch-on says the
 * final payment is now due.
 */
export const STEP_MESSAGE_DEFAULTS: Readonly<
  Record<string, { readonly notifyEvent?: 'started'; readonly messageKey: string }>
> = {
  structure_installation: { notifyEvent: 'started', messageKey: 'installation_started' },
  testing_commissioning: { messageKey: 'commissioning_completed' },
};

/** Messages a task step or a service visit sends; part of the default template list. */
export const STEP_MESSAGE_TEMPLATES = [
  {
    key: 'installation_started',
    audience: 'customer',
    fields: ['customer', 'project', 'capacity'],
    // [Project update]: a newer version of the template; sent only once its quick-reply switch is on.
    extras: { optionalQuickReplies: ['updatePayload'] },
    preview:
      'Hello {{1}}, installation of your solar system {{2}} ({{3}}) has started today. We will tell you when it is done.',
  },
  {
    key: 'commissioning_completed',
    audience: 'customer',
    fields: ['customer', 'project'],
    // [Pay now] (the final instalment, else the Payments answer) and [Warranty & AMC]: newer version, own switch.
    extras: { optionalQuickReplies: ['payPayload', 'warrantyPayload'] },
    preview:
      'Hello {{1}}, your solar system {{2}} is tested and switched on. The final payment is now due; we will send the amount and how to pay.',
  },
  {
    key: 'project_update_link',
    audience: 'customer',
    fields: ['customer', 'project', 'milestone', 'link'],
    preview:
      'Hello {{1}}, an update on your solar project {{2}}: {{3}}. See it here: {{4}} Thank you for choosing OneOhm.',
  },
  {
    key: 'service_visit_booked',
    audience: 'customer',
    fields: ['customer', 'topic', 'date'],
    preview:
      'Hello {{1}}, our technician will visit for your service request "{{2}}" on {{3}}. They will call before they come.',
  },
  {
    key: 'project_waiting',
    audience: 'customer',
    fields: ['customer', 'project', 'milestone', 'reason'],
    // [Send it now] when the wait is for the customer's own paper or reply: newer version, own switch.
    extras: { optionalQuickReplies: ['sendPayload'] },
    preview:
      'Hello {{1}}, a short delay on your solar project {{2}}: "{{3}}" is waiting for {{4}}. We will keep you posted here.',
  },
] as const satisfies readonly MessageTemplateDefault[];

/** Who a step can wait on outside OneOhm, in the customer's words (PRD 5.2 delay notice). */
export const WAITING_REASON_WORDS = {
  customer: 'a paper or a reply from you',
  bank: 'your bank',
  discom: 'the electricity board (DISCOM)',
} as const;
export type OutsideParty = keyof typeof WAITING_REASON_WORDS;

/** Only waits on someone outside OneOhm are worth telling the customer about. */
export const isOutsideParty = (party: string): party is OutsideParty =>
  Object.hasOwn(WAITING_REASON_WORDS, party);

/** Who hears a task's customer message: the customer, or also family members they added. */
export const TASK_MESSAGE_RECIPIENTS = ['customer', 'customer_and_family'] as const;
export type TaskMessageRecipients = (typeof TASK_MESSAGE_RECIPIENTS)[number];

/**
 * A link a task's customer message can carry (PRD 6.2 "optional attachments or report
 * links"): a statutory report (`report:wcr`) or the newest project paper in a folder
 * (`document:warranty`). Stored as one text value on the task template.
 */
export type TaskAttachment =
  | { readonly kind: 'report'; readonly key: string }
  | { readonly kind: 'document'; readonly category: string };

export function readTaskAttachment(value: string | null | undefined): TaskAttachment | null {
  const match = /^(report|document):([a-z0-9_-]{1,60})$/.exec(value ?? '');
  if (!match?.[2]) return null;
  return match[1] === 'report'
    ? { kind: 'report', key: match[2] }
    : { kind: 'document', category: match[2] };
}

export function writeTaskAttachment(attachment: TaskAttachment): string {
  return attachment.kind === 'report'
    ? `report:${attachment.key}`
    : `document:${attachment.category}`;
}
