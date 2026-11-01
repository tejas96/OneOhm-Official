import {
  APPROVAL_KINDS,
  ASSIGNMENT_STRATEGIES,
  JOB_NAMES,
  JOB_RUN_STATUSES,
  PROJECT_VARIANTS,
} from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';

const whole = z.number().int();
const clock = z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time, like 08:30.');

/** When reminders and summaries go out (PRD 7.2). The API checks the ranges. */
export const reminderTimingSchema = z.object({
  paymentGraceDays: whole,
  paymentRepeatDays: whole,
  staffDigestTime: clock,
  ownerSummaryTime: clock,
  followUpLeadDays: whole,
});
export type ReminderTimingRecord = z.infer<typeof reminderTimingSchema>;

/** How new work finds a person (PRD 3.8, 7.2). */
export const assignmentRulesSchema = z.object({
  strategy: z.enum(ASSIGNMENT_STRATEGIES),
  skipLeave: z.boolean(),
  preferSkill: z.boolean(),
  teamFirst: z.boolean(),
});
export type AssignmentRulesRecord = z.infer<typeof assignmentRulesSchema>;

/** Money approval limits (PRD 7.2, 7.3). Amounts in paise. */
export const approvalPolicySchema = z.object({
  billLimitPaise: whole,
  bonusLimitPaise: whole,
  escalateAfterDays: whole,
});
export type ApprovalPolicyRecord = z.infer<typeof approvalPolicySchema>;

/** The policy with the rules kept elsewhere, shown together on one screen. */
export const approvalPolicyViewSchema = approvalPolicySchema.extend({
  /** The discount share a sales person may give without approval, from the rate card. */
  discountLimitBp: whole,
});
export type ApprovalPolicyView = z.infer<typeof approvalPolicyViewSchema>;

/** What the command centre treats as late or soon (PRD 3.1, 7.2). */
export const dashboardSettingsSchema = z.object({
  riskLateDays: whole,
  dueSoonDays: whole,
  paymentLateDays: whole,
  discomWaitDays: whole,
  materialLookAheadDays: whole,
  actionsShown: whole,
  risksShown: whole,
  deadlinesShown: whole,
});
export type DashboardSettingsRecord = z.infer<typeof dashboardSettingsSchema>;

export const projectVariantSchema = z.object({
  key: z.enum(PROJECT_VARIANTS),
  name: z.string(),
  description: z.string(),
  active: z.boolean(),
  /** Projects of this kind so far. */
  projects: whole,
});
export type ProjectVariantRecord = z.infer<typeof projectVariantSchema>;

export const projectVariantInputSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(60),
  description: z.string().trim().max(240),
  active: z.boolean(),
});
export type ProjectVariantInput = z.infer<typeof projectVariantInputSchema>;

export const jobRunSchema = z.object({
  id: idSchema,
  name: z.enum(JOB_NAMES),
  trigger: z.enum(['schedule', 'background', 'retry']),
  status: z.enum(JOB_RUN_STATUSES),
  startedAt: instantSchema.nullable(),
  finishedAt: instantSchema.nullable(),
  result: z.string().nullable(),
  error: z.string().nullable(),
  retryable: z.boolean(),
  /** A retry is already waiting or ran after this failure. */
  retried: z.boolean(),
  createdAt: instantSchema,
});
export type JobRunRecord = z.infer<typeof jobRunSchema>;

export const jobRunsSchema = z.object({
  runs: z.array(jobRunSchema),
  failedLastWeek: whole,
});
export type JobRunsView = z.infer<typeof jobRunsSchema>;

/** One thing waiting for this person's yes (PRD 7.1 "approval workflows"). */
export const approvalItemSchema = z.object({
  kind: z.enum(APPROVAL_KINDS),
  id: idSchema,
  subject: z.string(),
  requesterName: z.string().nullable(),
  requestedAt: instantSchema,
  amountPaise: z.number().int().nullable(),
  projectCode: z.string().nullable(),
  /** Where it is decided in full. */
  href: z.string(),
  /** Waited longer than Settings allow; the owner has been told. */
  overdue: z.boolean(),
});
export type ApprovalItem = z.infer<typeof approvalItemSchema>;
