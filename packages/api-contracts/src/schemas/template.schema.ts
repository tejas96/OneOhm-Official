import {
  COMPLETION_ACTIONS,
  EPC_STAGES,
  EVIDENCE_KINDS,
  PROJECT_TYPES,
  TASK_MESSAGE_RECIPIENTS,
  TASK_NOTIFY_EVENTS,
  TASK_REVIEWERS,
  WAITING_PARTIES,
} from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

/** A WhatsApp template as approved in Meta's WhatsApp Manager (PRD 7.2). */
export const messageTemplateSchema = z.object({
  key: z.string(),
  audience: z.enum(['customer', 'staff']),
  metaName: z.string(),
  language: z.string(),
  /** The same message approved in Marathi (mr) and Hindi (hi); null sends English. */
  metaNameMr: z.string().nullable(),
  metaNameHi: z.string().nullable(),
  fields: z.array(z.string()),
  preview: z.string(),
  active: z.boolean(),
  extrasApproved: z.boolean(),
  /** How many task templates send this message. */
  usedByTasks: z.number().int(),
});
export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

const metaNameSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9_]{1,512}$/,
    'Lowercase letters, digits and underscores, as in WhatsApp Manager.',
  );

export const messageTemplateInputSchema = z.object({
  metaName: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9_]{1,512}$/,
      'Lowercase letters, digits and underscores, as in WhatsApp Manager.',
    ),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'For example en, hi, mr or en_US.'),
  metaNameMr: metaNameSchema.nullable().default(null),
  metaNameHi: metaNameSchema.nullable().default(null),
  fields: z.array(z.string().trim().min(1)).max(10),
  preview: z.string().trim().min(5).max(1024),
  active: z.boolean(),
  /** Left out, the switch keeps its value. */
  extrasApproved: z.boolean().optional(),
});

const conditionsSchema = z.object({
  projectTypes: z.array(z.enum(PROJECT_TYPES)).optional(),
  discomCodes: z.array(z.string().trim().min(1)).optional(),
  loan: z.boolean().optional(),
  battery: z.boolean().optional(),
  groundMount: z.boolean().optional(),
  subsidy: z.boolean().optional(),
  nameChange: z.boolean().optional(),
});

/** One step the business runs on every matching project (PRD 3.7). */
export const taskTemplateSchema = z.object({
  id: idSchema,
  key: z.string(),
  title: z.string(),
  /** What the task is, shown on every project task made from it (PRD 3.7). */
  description: z.string().nullable(),
  stage: z.enum(EPC_STAGES),
  roleKey: z.string(),
  /** A skill the assignee should have; the role is the fallback (PRD 3.7). */
  skillKey: z.string().nullable(),
  offsetDays: z.number().int(),
  durationDays: z.number().int(),
  dependsOn: z.array(z.string()),
  conditions: conditionsSchema.nullable(),
  waitingParty: z.enum(WAITING_PARTIES),
  customerVisible: z.boolean(),
  notifyCustomer: z.boolean(),
  notifyEvent: z.enum(TASK_NOTIFY_EVENTS),
  messageKey: z.string(),
  customerTitle: z.string().nullable(),
  /** Who hears the customer message: the customer only, or also family with access. */
  recipients: z.enum(TASK_MESSAGE_RECIPIENTS),
  /** A report (`report:wcr`) or paper folder (`document:warranty`) linked in the message. */
  attachment: z.string().nullable(),
  notifyManager: z.boolean(),
  /** Critical work: the engine proposes someone and a manager confirms (PRD 3.8). */
  confirmAssignee: z.boolean(),
  /** Days late before the manager hears; null uses the company setting. */
  escalateAfterDays: z.number().int().nullable(),
  approval: z.boolean(),
  /** Who approves: anyone with tasks.approve, or the project manager (PRD 3.7). */
  reviewer: z.enum(TASK_REVIEWERS),
  evidence: z.array(z.enum(EVIDENCE_KINDS)),
  captures: z.array(z.string()),
  /** Its own checklist; null uses the built-in lines (PRD 4.4). */
  checklist: z.array(z.object({ key: z.string(), label: z.string() })).nullable(),
  onComplete: z.enum(COMPLETION_ACTIONS).nullable(),
  reports: z.array(z.string()),
  position: z.number().int(),
  active: z.boolean(),
});
export type TaskTemplateRecord = z.infer<typeof taskTemplateSchema>;

export const taskTemplateInputSchema = taskTemplateSchema
  .omit({ id: true, position: true })
  .extend({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,60}$/, 'Lowercase words joined by underscores, like site_survey.'),
    title: z.string().trim().min(3, 'Name the task.').max(120),
    description: z.string().trim().max(500, 'Keep it under 500 characters.').nullable().optional(),
    reviewer: z.enum(TASK_REVIEWERS).default('approvers'),
    roleKey: z.string().trim().min(1, 'Pick who does it.'),
    skillKey: z.string().trim().max(60).nullable().optional(),
    checklist: z
      .array(
        z.object({
          key: z
            .string()
            .trim()
            .regex(/^[a-z0-9_]{1,40}$/),
          label: z.string().trim().min(3, 'Write what to check.').max(120),
        }),
      )
      .max(20, 'Keep the checklist to 20 lines.')
      .nullable()
      .optional(),
    offsetDays: z.number().int().min(0).max(365),
    durationDays: z.number().int().min(1).max(180),
    confirmAssignee: z.boolean().default(false),
    escalateAfterDays: z.number().int().min(1).max(90).nullable().default(null),
    customerTitle: z.string().trim().max(120).nullable(),
    recipients: z.enum(TASK_MESSAGE_RECIPIENTS).default('customer'),
    attachment: z
      .string()
      .trim()
      .regex(/^(report|document):[a-z0-9_-]{1,60}$/, 'Pick a report or a folder from the list.')
      .nullable()
      .default(null),
  });
export type TaskTemplateInput = z.infer<typeof taskTemplateInputSchema>;
