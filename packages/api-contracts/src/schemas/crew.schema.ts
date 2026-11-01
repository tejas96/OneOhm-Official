import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { moneyInMethodSchema } from './finance.schema';

/**
 * What a contractor crew sees about its own money and its own work (PRD 4.9): the
 * payables raised for its work orders and how they were paid, and the ratings and
 * rework on its jobs. Never project prices, margins or other contractors.
 */
export const crewPayableSchema = z.object({
  id: idSchema,
  /** The work order's payout, its retention held back, or an advance. */
  kind: z.enum(['work_order', 'retention', 'advance']),
  workOrderNumber: z.string(),
  project: z.object({ code: z.string(), name: z.string() }),
  amountPaise: paiseSchema,
  status: z.enum(['pending', 'approved', 'paid']),
  dueOn: calendarDateSchema,
  approvedAt: instantSchema.nullable(),
  paidOn: calendarDateSchema.nullable(),
  paidMethod: moneyInMethodSchema.nullable(),
});
export type CrewPayable = z.infer<typeof crewPayableSchema>;

export const crewPaymentsSchema = z.object({
  contractor: z.object({ id: idSchema, name: z.string() }),
  /** Raised and waiting for OneOhm's approval. */
  awaitingApprovalPaise: paiseSchema,
  /** Approved, to be paid. */
  approvedPaise: paiseSchema,
  paidPaise: paiseSchema,
  payables: z.array(crewPayableSchema),
});
export type CrewPayments = z.infer<typeof crewPaymentsSchema>;

export const crewFeedbackSchema = z.object({
  completedWorkOrders: z.number().int(),
  /** Share of finished tasks done by their due date; null before any finish. */
  onTimePercent: z.number().int().nullable(),
  /** Average customer rating (1–5) on the crew's projects; null before any. */
  averageRating: z.number().nullable(),
  ratings: z.array(
    z.object({
      projectCode: z.string(),
      projectName: z.string(),
      rating: z.number().int(),
      createdAt: instantSchema,
    }),
  ),
  rework: z.array(
    z.object({
      id: idSchema,
      workOrderNumber: z.string(),
      projectCode: z.string(),
      taskTitle: z.string().nullable(),
      note: z.string(),
      deductionPaise: paiseSchema,
      createdAt: instantSchema,
    }),
  ),
});
export type CrewFeedback = z.infer<typeof crewFeedbackSchema>;
