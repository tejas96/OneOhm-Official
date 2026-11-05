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
});
export type VisitsOf = z.infer<typeof visitsOfSchema>;

/** Set the day: confirms the customer's pick, moves it, or books it with no pick. */
export const setVisitSchema = visitScopeSchema.extend({
  day: calendarDateSchema,
  slot: z.enum(VISIT_SLOTS),
});
export type SetVisit = z.infer<typeof setVisitSchema>;

export const cancelVisitSchema = z.object({ reason: z.string().trim().max(200).optional() });
