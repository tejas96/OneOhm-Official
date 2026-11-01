import { CHANGE_REQUEST_TYPES, EPC_STAGES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';
import { waitingPartySchema } from './project.schema';

export const changeRequestTypeSchema = z.enum(CHANGE_REQUEST_TYPES);
export const changeRequestStatusSchema = z.enum(['open', 'completed', 'cancelled']);
export const changeRequestStepStatusSchema = z.enum([
  'pending',
  'ready',
  'in_progress',
  'waiting',
  'completed',
]);

/** One piece of work waiting on a DISCOM: a project task or a change-request step. */
export const discomDeskItemSchema = z.object({
  kind: z.enum(['task', 'change_request']),
  id: idSchema,
  title: z.string(),
  subject: z.string(),
  href: z.string(),
  assignee: userRefSchema.nullable(),
  waitingSince: instantSchema.nullable(),
  ageDays: z.number().int(),
  expectedDays: z.number().int(),
  referenceNumber: z.string().nullable(),
  office: z.string().nullable(),
  nextFollowUpOn: calendarDateSchema.nullable(),
  followUpDue: z.boolean(),
  note: z.string().nullable(),
});
export type DiscomDeskItem = z.infer<typeof discomDeskItemSchema>;

export const discomDeskSchema = z.object({
  groups: z.array(
    z.object({
      discom: z.object({ id: idSchema, code: z.string(), name: z.string() }).nullable(),
      expectedDays: z.number().int(),
      /** Mean days DISCOM steps took here, over finished and still-waiting work. */
      averageWaitDays: z.number().nullable(),
      samples: z.number().int(),
      waiting: z.array(discomDeskItemSchema),
    }),
  ),
  /** Which DISCOM step takes longest, so the business sees where utility delays come from. */
  stepAverages: z.array(
    z.object({
      discomCode: z.string(),
      step: z.string(),
      averageDays: z.number(),
      samples: z.number().int(),
    }),
  ),
  totals: z.object({
    waiting: z.number().int(),
    followUpsDue: z.number().int(),
    openChangeRequests: z.number().int(),
  }),
});
export type DiscomDesk = z.infer<typeof discomDeskSchema>;

export const changeRequestSummarySchema = z.object({
  id: idSchema,
  number: z.string(),
  type: changeRequestTypeSchema,
  status: changeRequestStatusSchema,
  customer: z.object({ id: idSchema, name: z.string() }),
  property: z.object({ id: idSchema, label: z.string(), city: z.string() }),
  project: z.object({ id: idSchema, code: z.string(), name: z.string() }).nullable(),
  discomCode: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  currentStep: z
    .object({
      title: z.string(),
      status: changeRequestStepStatusSchema,
      waitingParty: waitingPartySchema,
    })
    .nullable(),
  stepsDone: z.number().int(),
  stepsTotal: z.number().int(),
  createdAt: instantSchema,
  completedAt: instantSchema.nullable(),
});
export type ChangeRequestSummary = z.infer<typeof changeRequestSummarySchema>;

export const changeRequestStepSchema = z.object({
  id: idSchema,
  key: z.string(),
  title: z.string(),
  status: changeRequestStepStatusSchema,
  waitingParty: waitingPartySchema,
  assignee: userRefSchema.nullable(),
  dueDate: calendarDateSchema,
  overdue: z.boolean(),
  captures: z.array(z.string()),
  waitingSince: instantSchema.nullable(),
  nextFollowUpOn: calendarDateSchema.nullable(),
  note: z.string().nullable(),
  completedAt: instantSchema.nullable(),
});
export type ChangeRequestStepView = z.infer<typeof changeRequestStepSchema>;

export const changeRequestDetailSchema = changeRequestSummarySchema.extend({
  values: z.record(z.string(), z.string()),
  captured: z.record(z.string(), z.string()),
  previousValues: z.record(z.string(), z.unknown()).nullable(),
  appliedValues: z.record(z.string(), z.unknown()).nullable(),
  note: z.string().nullable(),
  cancelledReason: z.string().nullable(),
  steps: z.array(changeRequestStepSchema),
  blocks: z.object({ stages: z.array(z.enum(EPC_STAGES)), taskKeys: z.array(z.string()) }),
});
export type ChangeRequestDetail = z.infer<typeof changeRequestDetailSchema>;

export const changeRequestSuggestionSchema = z.object({
  type: changeRequestTypeSchema,
  reason: z.string(),
});
