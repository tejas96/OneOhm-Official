import { EPC_STAGES, PROJECT_TYPES, WAITING_PARTIES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';
import { attachmentSchema } from './document.schema';

export const epcStageSchema = z.enum(EPC_STAGES);
export const waitingPartySchema = z.enum(WAITING_PARTIES);
export const projectTypeSchema = z.enum(PROJECT_TYPES);
export const taskStatusSchema = z.enum([
  'pending',
  'ready',
  'in_progress',
  'waiting',
  'in_review',
  'completed',
]);
export const toneSchema = z.enum([
  'onTrack',
  'atRisk',
  'blocked',
  'overdue',
  'review',
  'waiting',
  'done',
  'neutral',
]);

export const projectSummarySchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  place: z.string(),
  type: projectTypeSchema,
  capacityWp: z.number().int(),
  discom: z.string(),
  status: z.enum(['active', 'operational', 'completed', 'cancelled']),
  currentStage: epcStageSchema,
  stageProgress: z.number(),
  skippedStages: z.array(epcStageSchema),
  tone: toneSchema,
  toneLabel: z.string(),
  waitingOn: waitingPartySchema.nullable(),
  waitingDays: z.number().int(),
  next: z.object({ label: z.string(), date: calendarDateSchema }).nullable(),
  openTasks: z.number().int(),
  overdueTasks: z.number().int(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectTaskSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  projectName: z.string(),
  templateKey: z.string(),
  title: z.string(),
  stage: epcStageSchema,
  roleKey: z.string(),
  assignee: userRefSchema.nullable(),
  status: taskStatusSchema,
  waitingParty: waitingPartySchema,
  startDate: calendarDateSchema,
  dueDate: calendarDateSchema,
  overdue: z.boolean(),
  customerVisible: z.boolean(),
  approval: z.boolean(),
  evidence: z.array(z.string()),
  /** Facts this task must capture before it can complete. */
  captures: z.array(z.string()),
  /** Files attached to this task (photos and documents), oldest first. */
  attachments: z.array(attachmentSchema),
  /** Evidence still needed before the task can complete, e.g. ['photo']. */
  missingEvidence: z.array(z.string()),
  blockedBy: z.array(z.string()),
  completedAt: instantSchema.nullable(),
});
export type ProjectTask = z.infer<typeof projectTaskSchema>;

export const milestoneSchema = z.object({
  id: idSchema,
  label: z.string(),
  payer: z.enum(['customer', 'bank']),
  amountPaise: paiseSchema,
  paidPaise: paiseSchema,
  status: z.enum(['upcoming', 'due', 'partly_paid', 'paid']),
  trigger: z.string(),
});

export const paymentSchema = z.object({
  id: idSchema,
  milestoneId: idSchema.nullable(),
  payer: z.enum(['customer', 'bank']),
  method: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'razorpay', 'bank_disbursement']),
  amountPaise: paiseSchema,
  receivedOn: calendarDateSchema,
  reference: z.string().nullable(),
});

export const reportStatusSchema = z.object({
  key: z.string(),
  name: z.string(),
  status: z.enum(['ready', 'missing', 'not_needed']),
  missing: z.array(
    z.object({ field: z.string(), label: z.string(), taskTitle: z.string().nullable() }),
  ),
});
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const projectDetailSchema = projectSummarySchema.extend({
  customer: z.object({ id: idSchema, name: z.string(), phone: z.string() }),
  address: z.string(),
  manager: userRefSchema.nullable(),
  startDate: calendarDateSchema,
  loan: z.boolean(),
  lenderName: z.string().nullable(),
  battery: z.boolean(),
  groundMount: z.boolean(),
  subsidy: z.boolean(),
  quotation: z.object({
    id: idSchema,
    number: z.string(),
    totalPaise: paiseSchema,
    subsidyPaise: paiseSchema,
    effectivePaise: paiseSchema,
  }),
  tasks: z.array(projectTaskSchema),
  milestones: z.array(milestoneSchema),
  payments: z.array(paymentSchema),
  facts: z.record(z.string(), z.string()),
  activities: z.array(
    z.object({
      id: idSchema,
      kind: z.string(),
      message: z.string(),
      user: userRefSchema.nullable(),
      createdAt: instantSchema,
    }),
  ),
  reports: z.array(reportStatusSchema),
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
