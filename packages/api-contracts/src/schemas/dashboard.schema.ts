import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import {
  deliveryOutlookSchema,
  materialRisksSchema,
  projectStatesSchema,
} from './command-center-risks.schema';
import { projectSummarySchema, projectTypeSchema, toneSchema } from './project.schema';

const waitingSchema = z.object({
  internal: z.number().int(),
  customer: z.number().int(),
  bank: z.number().int(),
  discom: z.number().int(),
});

export const actionItemSchema = z.object({
  id: z.string(),
  tone: toneSchema,
  title: z.string(),
  detail: z.string(),
  action: z.string(),
  party: z.enum(['internal', 'customer', 'bank', 'discom']),
  href: z.string(),
});
export type ActionItem = z.infer<typeof actionItemSchema>;

export const COMMAND_CENTER_PERIODS = [
  'this_month',
  'last_30_days',
  'this_quarter',
  'this_year',
] as const;

/** Filters: the period for flows (installed, collected, sales); manager and type narrow projects. */
export const commandCenterQuerySchema = z.object({
  period: z.enum(COMMAND_CENTER_PERIODS).default('this_month'),
  managerUserId: idSchema.optional(),
  projectType: projectTypeSchema.optional(),
});
export type CommandCenterQuery = z.input<typeof commandCenterQuerySchema>;

const partySchema = z.enum(['internal', 'customer', 'bank', 'discom']);

/** Something that could slip on a live project, and the next action that keeps it moving. */
export const riskItemSchema = z.object({
  taskId: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  projectName: z.string(),
  taskTitle: z.string(),
  kind: z.enum(['overdue', 'waiting', 'unassigned']),
  /** Days past due (overdue) or days waiting on the party (waiting). */
  days: z.number().int(),
  party: partySchema,
  dueDate: calendarDateSchema,
  owner: z.string().nullable(),
  managerName: z.string().nullable(),
});
export type RiskItem = z.infer<typeof riskItemSchema>;

export const decisionKeySchema = z.enum([
  'discounts',
  'task_reviews',
  'bills',
  'change_requests',
  'service_requests',
  'bank_claims',
  'leave',
  'attendance_corrections',
  'travel_claims',
  'purchase_requests',
  'vendor_advances',
  'points',
  'incentives',
]);
export const deadlineSchema = z.object({
  taskId: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  title: z.string(),
  dueDate: calendarDateSchema,
  assignee: z.string().nullable(),
  customerVisible: z.boolean(),
});
export type Deadline = z.infer<typeof deadlineSchema>;

/** Everything the owner's command centre shows; every figure links to its records. */
export const commandCenterSchema = z.object({
  range: z.object({ start: calendarDateSchema, end: calendarDateSchema }),
  generatedAt: instantSchema,
  /** Manager or type filters are on: project figures cover only those projects. */
  narrowed: z.boolean(),
  kpis: z.object({
    liveProjects: z.number().int(),
    needingAttention: z.number().int(),
    overdueTasks: z.number().int(),
    openTasks: z.number().int(),
    unassignedTasks: z.number().int(),
    quotationsSent: z.number().int(),
    quotationsAccepted: z.number().int(),
  }),
  risks: z.array(riskItemSchema),
  decisions: z.array(
    z.object({ key: decisionKeySchema, count: z.number().int(), href: z.string() }),
  ),
  deadlines: z.array(deadlineSchema),
  health: z.object({
    score: z.number().int(),
    delivery: z.number().int(),
    money: z.number().int(),
    team: z.number().int(),
  }),
  installed: z.object({
    wattsPeak: z.number().int(),
    commissioned: z.number().int(),
    dueThisWeek: z.number().int(),
    byType: z.object({
      residential: z.number().int(),
      society: z.number().int(),
      commercial: z.number().int(),
    }),
  }),
  collections: z.object({
    collectedPaise: paiseSchema,
    duePaise: paiseSchema,
    weekly: z.array(paiseSchema),
  }),
  actions: z.array(actionItemSchema),
  waitingDays: waitingSchema,
  pipeline: z.object({
    leads: z.number().int(),
    surveys: z.number().int(),
    quotations: z.number().int(),
    accepted: z.number().int(),
  }),
  projects: z.array(projectSummarySchema),
  /** Projects by state, completed ones for the period. */
  states: projectStatesSchema,
  /** When the live projects are expected to finish. */
  outlook: deliveryOutlookSchema,
  materials: materialRisksSchema,
  money: z.object({
    /** Project revenue booked in the ledger in the period (milestones falling due). */
    revenuePaise: paiseSchema,
    collectedPaise: paiseSchema,
    stillDuePaise: paiseSchema,
    bankPendingPaise: paiseSchema,
    /** Everything still owed on vendor and contractor bills, whenever it falls due. */
    toVendorsPaise: paiseSchema,
    toContractorsPaise: paiseSchema,
    /** Of those, what falls due in the coming seven days (or is already late). */
    dueThisWeekPaise: paiseSchema,
    /** Crew advances on work orders not yet paid out. */
    advancesPaise: paiseSchema,
  }),
  liveProjects: z.number().int(),
});
export type CommandCenter = z.infer<typeof commandCenterSchema>;
