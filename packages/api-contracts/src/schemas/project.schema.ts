import { EPC_STAGES, PROJECT_TYPES, WAITING_PARTIES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';
import { attachmentSchema } from './document.schema';
import { openLinkSchema } from './payment-link.schema';
import { projectSetupSchema } from './project-team.schema';
import { taskReturnSchema, taskReviewerSchema } from './task-flow.schema';

export const epcStageSchema = z.enum(EPC_STAGES);
export const waitingPartySchema = z.enum(WAITING_PARTIES);
export const projectTypeSchema = z.enum(PROJECT_TYPES);

/** One fact a task records: key, readable label, input kind and an optional hint. */
export const factFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  input: z.enum(['text', 'number', 'date', 'long']),
  hint: z.string().optional(),
});
export type FactFieldInfo = z.infer<typeof factFieldSchema>;
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
  tasksDone: z.number().int(),
  tasksTotal: z.number().int(),
  manager: z.object({ id: idSchema, fullName: z.string() }).nullable(),
  /** Why the work cannot move, in one sentence, when the project is blocked. */
  blockedBy: z.string().nullable(),
  /**
   * Expected finish (PRD 3.1): the last open task's due date moved on by how late the
   * work runs now (`deliveryForecast` in the domain package). Null once nothing is open.
   */
  forecast: z.object({
    plannedFinish: calendarDateSchema.nullable(),
    slipDays: z.number().int(),
    expectedFinish: calendarDateSchema.nullable(),
  }),
  /** The day the last task finished, once the project is completed. */
  completedOn: calendarDateSchema.nullable(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectTaskSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  projectName: z.string(),
  templateKey: z.string(),
  title: z.string(),
  /** What the task is, from its template (PRD 3.7). */
  description: z.string().nullable(),
  stage: epcStageSchema,
  roleKey: z.string(),
  assignee: userRefSchema.nullable(),
  /** A critical task's suggested person, waiting for a manager to confirm (PRD 3.8). */
  proposedAssignee: userRefSchema.nullable(),
  /** Given outside the project's named team because nobody in it fitted. */
  outsideTeam: z.boolean(),
  status: taskStatusSchema,
  waitingParty: waitingPartySchema,
  startDate: calendarDateSchema,
  dueDate: calendarDateSchema,
  overdue: z.boolean(),
  customerVisible: z.boolean(),
  approval: z.boolean(),
  /** Who approves it: anyone with tasks.approve, or the project manager. */
  reviewer: taskReviewerSchema,
  /** While in review: the people who may approve it or send it back. */
  reviewerIds: z.array(idSchema),
  /** Sent back for correction and not yet sent again; null otherwise. */
  returned: taskReturnSchema.nullable(),
  /** How many times the work was sent back (rework). */
  reworkCount: z.number().int(),
  evidence: z.array(z.string()),
  /** Facts this task must capture before it can complete. */
  captures: z.array(z.string()),
  /**
   * The same facts with their label, input kind and hint, ready to render as a form,
   * followed by the measurements the task records (evidence 'measurement').
   */
  captureFields: z.array(factFieldSchema),
  /** The keys in `captureFields` that are the task's measurements. */
  measurements: z.array(z.string()),
  /** Values the project already has for those facts, to pre-fill the form. */
  knownFacts: z.record(z.string(), z.string()),
  /**
   * Items to tick before completing (evidence 'checklist'). A tick is sent with the
   * completion as the fact `key` (any value, e.g. 'yes'); `done` once it is saved.
   */
  checklist: z.array(z.object({ key: z.string(), label: z.string(), done: z.boolean() })),
  /** Files attached to this task (photos, documents, the signature), oldest first. */
  attachments: z.array(attachmentSchema.extend({ category: z.string() })),
  /**
   * Evidence still needed before the task can complete, e.g. ['photo']. Checklist and
   * measurements count once saved, so an open task lists them until it is completed.
   */
  missingEvidence: z.array(z.string()),
  blockedBy: z.array(z.string()),
  /** The part of `blockedBy` that is open DISCOM change requests, not earlier tasks. */
  changeBlockers: z.array(z.string()),
  /** Open tasks that wait for this one to finish. */
  blocking: z.array(z.string()),
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
  link: openLinkSchema,
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
  /** The task this report waits for before it can be made (its trigger), if any. */
  waitingFor: z.string().nullable().optional(),
  /** The customer sees it in their app once ready (its DISCOM's format, Settings → DISCOMs). */
  customerVisible: z.boolean().optional(),
  /**
   * Its copy in the project documents (PRD 3.18): when saved, when handed in, and whether
   * the data behind it changed after that (a submitted report is not saved again by itself).
   */
  filing: z
    .object({
      documentId: idSchema.nullable(),
      savedAt: instantSchema.nullable(),
      submittedAt: instantSchema.nullable(),
      changedSinceSaved: z.boolean(),
      changedAfterSubmission: z.boolean(),
    })
    .optional(),
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
  /** Work complete and every milestone paid (PRD 3.11); null until both are true. */
  financiallyClosedAt: instantSchema.nullable(),
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
  /** The budget after the site survey (PRD 3.5, Flow A). */
  budget: z.object({
    status: z.enum(['awaiting_survey', 'locked', 'revision_needed', 'revised']),
    variancePaise: paiseSchema.nullable(),
    varianceBp: z.number().int().nullable(),
    lockedAt: instantSchema.nullable(),
    revisionQuotationId: idSchema.nullable(),
  }),
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
  /** Contractor, named team, target finish and survey report (PRD 3.4, 3.8). */
  setup: projectSetupSchema,
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
