import {
  COMPLETION_ACTIONS,
  EPC_STAGES,
  EVIDENCE_KINDS,
  PROJECT_TYPES,
  TASK_NOTIFY_EVENTS,
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
  fields: z.array(z.string()),
  preview: z.string(),
  active: z.boolean(),
  /** How many task templates send this message. */
  usedByTasks: z.number().int(),
});
export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

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
  fields: z.array(z.string().trim().min(1)).max(10),
  preview: z.string().trim().min(5).max(1024),
  active: z.boolean(),
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
  stage: z.enum(EPC_STAGES),
  roleKey: z.string(),
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
  notifyManager: z.boolean(),
  approval: z.boolean(),
  evidence: z.array(z.enum(EVIDENCE_KINDS)),
  captures: z.array(z.string()),
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
    roleKey: z.string().trim().min(1, 'Pick who does it.'),
    offsetDays: z.number().int().min(0).max(365),
    durationDays: z.number().int().min(1).max(180),
    customerTitle: z.string().trim().max(120).nullable(),
  });
export type TaskTemplateInput = z.infer<typeof taskTemplateInputSchema>;
