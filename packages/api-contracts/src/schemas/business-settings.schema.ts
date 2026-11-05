import {
  APPROVAL_KINDS,
  ASSIGNMENT_STRATEGIES,
  JOB_NAMES,
  JOB_RUN_STATUSES,
  LEAD_ASSIGNMENT_STRATEGIES,
  MAX_BILL_BANDS,
  MAX_CITIES_PER_OWNER,
  MAX_NUDGE_AFTER_HOURS,
  MAX_ROW_TITLE,
  MAX_SERVICE_CITIES,
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
  subsidyChaseDays: whole,
  selfSurveyOffer: z.boolean(),
  selfSurveyPaise: whole,
  whatsappNightReply: z.boolean(),
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

/** Who gets a new lead nobody picked: the way to choose, and city owners who go first. */
export const leadAssignmentRulesSchema = z.object({
  strategy: z.enum(LEAD_ASSIGNMENT_STRATEGIES),
  cityOwners: z.array(
    z.object({
      userId: idSchema,
      cities: z.array(z.string().max(80)).max(MAX_CITIES_PER_OWNER),
      /** Read only: the person's name, shown even after they stop working on leads. */
      name: z.string().optional(),
      /** Read only: deactivated or no longer working on leads; dropped on the next save. */
      inactive: z.boolean().optional(),
    }),
  ),
});
export type LeadAssignmentRulesRecord = z.infer<typeof leadAssignmentRulesSchema>;

/** How the WhatsApp onboarding bot greets a stranger and prices an instant estimate. */
export const onboardingSettingsSchema = z.object({
  enabled: z.boolean(),
  serviceCities: z.array(z.string().max(80)).max(MAX_SERVICE_CITIES + 8),
  billBands: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().max(MAX_ROW_TITLE),
        labelMr: z.string().max(MAX_ROW_TITLE).optional(),
        labelHi: z.string().max(MAX_ROW_TITLE).optional(),
        targetWp: z.number().int().positive().nullable(),
        maxRupees: z.number().positive().nullable().optional(),
      }),
    )
    .max(MAX_BILL_BANDS),
  tariffPaisePerUnit: z.number().positive(),
  unitsPerKwMonth: z.number().positive(),
  nudgeAfterHours: z.number().min(0).max(MAX_NUDGE_AFTER_HOURS),
  panelProductIds: z.object({
    individual: idSchema.optional(),
    commercial: idSchema.optional(),
  }),
});
export type OnboardingSettingsRecord = z.infer<typeof onboardingSettingsSchema>;

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
  /** A failure the same job put right on a later run; it needs nobody's attention. */
  recovered: z.boolean(),
  /** For a retry: the failed run it repeats. */
  retryOfId: idSchema.nullable(),
  /** What the run was about, when it has one (for message delivery, the message's ID). */
  subjectId: idSchema.nullable(),
  /** Who asked for a retry by hand; empty for runs the system started. */
  requestedBy: z.object({ id: idSchema, name: z.string() }).nullable(),
  createdAt: instantSchema,
});
export type JobRunRecord = z.infer<typeof jobRunSchema>;

export const jobRunsSchema = z.object({
  runs: z.array(jobRunSchema),
  failedLastWeek: whole,
  /** Daily jobs with no run in the last 26 hours: the worker is likely stopped. */
  missingDaily: z.array(z.enum(JOB_NAMES)),
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
