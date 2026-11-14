import { VISIT_KINDS, VISIT_SLOTS, VISIT_STATUSES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../common/primitives';

/** What a visit is about: a task, a lead's survey or a service request (AMC included). */
export const visitScopeSchema = z.object({
  taskId: idSchema.optional(),
  leadId: idSchema.optional(),
  serviceRequestId: idSchema.optional(),
});
export type VisitScope = z.infer<typeof visitScopeSchema>;

export const visitSchema = z.object({
  id: idSchema,
  kind: z.enum(VISIT_KINDS),
  status: z.enum(VISIT_STATUSES),
  day: calendarDateSchema,
  slot: z.enum(VISIT_SLOTS),
  /** Exact time in minutes after midnight (null for a DISCOM date); `time` says it ("10:00–11:30 am"). */
  startMin: z.number().int().nullable(),
  endMin: z.number().int().nullable(),
  time: z.string().nullable(),
  home: z.string(),
  taskId: idSchema.nullable(),
  leadId: idSchema.nullable(),
  serviceRequestId: idSchema.nullable(),
  crew: z.array(z.object({ id: idSchema, name: z.string(), phone: z.string().nullable() })),
  proposedBy: z.enum(['customer', 'staff']),
  customerConfirmedAt: z.string().nullable(),
  customerCannotAt: z.string().nullable(),
  /** The customer may be messaged for this visit (a task's template must allow it). */
  customerMessages: z.boolean(),
});
export type Visit = z.infer<typeof visitSchema>;

/** The visits of a scope (open one first) and the days the crew is free to offer. */
export const visitsOfSchema = z.object({
  /** What the staff can do here: this kind of work is a visit. */
  kind: z.enum(VISIT_KINDS).nullable(),
  /** Staff may set a day, or must tell the customer a DISCOM date instead of asking. */
  presence: z.boolean(),
  /** The customer may be messaged (the task's template allows it). */
  customerMessages: z.boolean(),
  visits: z.array(visitSchema),
  /** The task's own start day, so the card can show when the visit and the task differ. */
  taskStartDate: calendarDateSchema.nullable(),
  freeDays: z.array(calendarDateSchema),
  /** The free times of each free day, for staff (Settings → Visits & bookings). */
  freeTimes: z.record(
    calendarDateSchema,
    z.array(z.object({ startMin: z.number().int(), endMin: z.number().int(), label: z.string() })),
  ),
});
export type VisitsOf = z.infer<typeof visitsOfSchema>;

/** Set the day: confirms the customer's pick, moves it, or books it with no pick. */
export const setVisitSchema = visitScopeSchema.extend({
  day: calendarDateSchema,
  /** Older clients send a half of the day; the exact time is `startMin`. */
  slot: z.enum(VISIT_SLOTS),
  startMin: z.number().int().min(0).max(1439).optional(),
});
export type SetVisit = z.infer<typeof setVisitSchema>;

export const cancelVisitSchema = z.object({ reason: z.string().trim().max(200).optional() });

/** The visits page: open and recent visits of a date range, for one person or everyone. */
export const visitListQuerySchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  userId: idSchema.optional(),
});

export const visitListRowSchema = z.object({
  id: idSchema,
  kind: z.enum(VISIT_KINDS),
  status: z.enum(VISIT_STATUSES),
  day: calendarDateSchema,
  startMin: z.number().int().nullable(),
  time: z.string(),
  customer: z.string(),
  phone: z.string(),
  home: z.string(),
  crew: z.array(z.object({ id: idSchema, name: z.string() })),
  leadId: idSchema.nullable(),
  taskId: idSchema.nullable(),
  projectId: idSchema.nullable(),
  serviceRequestId: idSchema.nullable(),
  customerConfirmed: z.boolean(),
});
export type VisitListRow = z.infer<typeof visitListRowSchema>;
