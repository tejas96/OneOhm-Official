import { SERVICE_CATEGORY_KEY_PATTERN } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, noteSchema } from '../common/primitives';
import { attachmentSchema } from './document.schema';

export const SERVICE_STATUSES = ['open', 'in_progress', 'resolved'] as const;

/** A request a customer raised, or a planned AMC visit OneOhm opened itself. */
export const SERVICE_KINDS = ['request', 'maintenance_visit'] as const;

/** Where a service-level clock stands (PRD 7.2); null when the request has none. */
export const SLA_STATES = ['on_track', 'due_soon', 'breached', 'met', 'missed'] as const;
export type SlaStateValue = (typeof SLA_STATES)[number];

/** Filters for the desk: requests about to miss a promise, or that missed one. */
export const SLA_FILTERS = ['due_soon', 'breached'] as const;

/** Categories are configurable (Settings → Service and SLAs); keys never change once used. */
export const serviceCategoryKeySchema = z
  .string()
  .regex(SERVICE_CATEGORY_KEY_PATTERN, 'Use lower-case letters, digits and underscores.');

export const ticketSlaSchema = z.object({
  response: z.enum(SLA_STATES).nullable(),
  resolution: z.enum(SLA_STATES).nullable(),
});

export const ticketRatingSchema = z.object({
  rating: z.number().int(),
  comment: z.string().nullable(),
  createdAt: instantSchema,
});

/** A customer's service request as the office works it. */
export const serviceTicketSchema = z.object({
  id: idSchema,
  category: serviceCategoryKeySchema,
  categoryLabel: z.string(),
  kind: z.enum(SERVICE_KINDS),
  /** The day of a planned maintenance visit. */
  scheduledFor: calendarDateSchema.nullable(),
  description: z.string(),
  status: z.enum(SERVICE_STATUSES),
  customer: z.object({ id: idSchema, name: z.string(), phone: z.string() }),
  project: z.object({ id: idSchema, code: z.string() }).nullable(),
  assignee: z.object({ id: idSchema, name: z.string() }).nullable(),
  resolutionNote: z.string().nullable(),
  /** Photos the customer added in the app, oldest first. */
  photos: z.array(z.object({ id: idSchema, name: z.string() })),
  /** The customer's short video and voice note, if they added them. */
  media: z.array(attachmentSchema),
  /** The day the desk booked the technician's visit to a request (PRD 5.5). */
  visitOn: calendarDateSchema.nullable(),
  responseDueAt: instantSchema.nullable(),
  resolutionDueAt: instantSchema.nullable(),
  respondedAt: instantSchema.nullable(),
  sla: ticketSlaSchema,
  rating: ticketRatingSchema.nullable(),
  createdAt: instantSchema,
  resolvedAt: instantSchema.nullable(),
});
export type ServiceTicket = z.infer<typeof serviceTicketSchema>;

export const serviceTicketQuerySchema = z.object({
  status: z.enum(SERVICE_STATUSES).optional(),
  sla: z.enum(SLA_FILTERS).optional(),
  kind: z.enum(SERVICE_KINDS).optional(),
});

export const serviceTicketPatchSchema = z.object({
  status: z.enum(SERVICE_STATUSES).optional(),
  assigneeUserId: idSchema.nullable().optional(),
  category: serviceCategoryKeySchema.optional(),
  resolutionNote: noteSchema.nullable().optional(),
});

/** Books or moves the technician's visit day; null clears it. */
export const serviceVisitDaySchema = z.object({ visitOn: calendarDateSchema.nullable() });

/** Someone who can take service work, with how much is open on them. */
export const serviceAssigneeSchema = z.object({
  id: idSchema,
  name: z.string(),
  open: z.number().int(),
  onLeave: z.boolean(),
});
export type ServiceAssignee = z.infer<typeof serviceAssigneeSchema>;

export const feedbackEntrySchema = z.object({
  id: idSchema,
  rating: z.number().int(),
  comment: z.string().nullable(),
  customer: z.object({ id: idSchema, name: z.string() }),
  project: z.object({ id: idSchema, code: z.string() }),
  createdAt: instantSchema,
});
export type FeedbackEntry = z.infer<typeof feedbackEntrySchema>;
