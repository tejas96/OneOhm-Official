import { z } from 'zod';
import { idSchema, instantSchema, noteSchema } from '../common/primitives';
import { SERVICE_CATEGORIES } from './customer-portal.schema';

export const SERVICE_STATUSES = ['open', 'in_progress', 'resolved'] as const;

/** A customer's service request as the office works it. */
export const serviceTicketSchema = z.object({
  id: idSchema,
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string(),
  status: z.enum(SERVICE_STATUSES),
  customer: z.object({ id: idSchema, name: z.string(), phone: z.string() }),
  project: z.object({ id: idSchema, code: z.string() }).nullable(),
  assignee: z.object({ id: idSchema, name: z.string() }).nullable(),
  resolutionNote: z.string().nullable(),
  /** Photos the customer added in the app, oldest first. */
  photos: z.array(z.object({ id: idSchema, name: z.string() })),
  createdAt: instantSchema,
  resolvedAt: instantSchema.nullable(),
});
export type ServiceTicket = z.infer<typeof serviceTicketSchema>;

export const serviceTicketPatchSchema = z.object({
  status: z.enum(SERVICE_STATUSES).optional(),
  assigneeUserId: idSchema.nullable().optional(),
  resolutionNote: noteSchema.nullable().optional(),
});

export const feedbackEntrySchema = z.object({
  id: idSchema,
  rating: z.number().int(),
  comment: z.string().nullable(),
  customer: z.object({ id: idSchema, name: z.string() }),
  project: z.object({ id: idSchema, code: z.string() }),
  createdAt: instantSchema,
});
export type FeedbackEntry = z.infer<typeof feedbackEntrySchema>;
