import {
  CUSTOMER_ACTION_STATUSES,
  CUSTOMER_ACTION_TYPES,
  CUSTOMER_REQUESTABLE_CATEGORIES,
  DOCUMENT_REQUEST_TITLE_MAX,
} from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

export const documentRequestStatusSchema = z.enum(CUSTOMER_ACTION_STATUSES);

/**
 * A paper the team asked the customer for, as staff see it (PRD 5.4, 6.1): a customer
 * action of type paper. The list holds papers only until other types have their flows.
 */
export const documentRequestSchema = z.object({
  id: idSchema,
  type: z.enum(CUSTOMER_ACTION_TYPES),
  customerId: idSchema,
  /** A paper asked on a lead before any project exists. */
  leadId: idSchema.nullable(),
  projectId: idSchema.nullable(),
  projectCode: z.string().nullable(),
  /** The home the project is on: its site label, else its town. */
  homeName: z.string().nullable(),
  category: z.enum(CUSTOMER_REQUESTABLE_CATEGORIES),
  title: z.string(),
  note: z.string(),
  /** The checklist item it answers, when asked from the checklist. */
  requirementKey: z.string().nullable(),
  /** The latest "ask again" reason, as the customer sees it. */
  reason: z.string(),
  status: documentRequestStatusSchema,
  documentId: idSchema.nullable(),
  /** Whether the team has checked the paper that answered it; null without a paper. */
  documentChecked: z.boolean().nullable(),
  /** The paper was filed by the team (a staff upload): asking again keeps it. */
  documentByTeam: z.boolean().nullable(),
  requestedBy: z.string().nullable(),
  /** A pin the customer sent for a home that already has a point, waiting for the team to check. */
  suggestion: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      /** Metres from the point the home has; null when it has none. */
      distanceM: z.number().int().nullable(),
    })
    .nullable()
    .default(null),
  /** Reminders sent to the customer since the latest ask. */
  remindersSent: z.number().int(),
  createdAt: z.string(),
  receivedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
});
export type DocumentRequest = z.infer<typeof documentRequestSchema>;

export const documentRequestQuerySchema = z.object({
  projectId: idSchema.optional(),
  customerId: idSchema.optional(),
  leadId: idSchema.optional(),
});
export type DocumentRequestQuery = z.infer<typeof documentRequestQuerySchema>;

/** Ask for a paper on a project, or on a lead (with its site) before a project exists. */
export const newDocumentRequestSchema = z
  .object({
    projectId: idSchema.optional(),
    leadId: idSchema.optional(),
    category: z.enum(CUSTOMER_REQUESTABLE_CATEGORIES),
    title: z.string().trim().min(2).max(DOCUMENT_REQUEST_TITLE_MAX),
    note: z.string().trim().max(300).default(''),
    /** The checklist row it is asked from; a free ask has none. */
    requirementKey: z.string().trim().min(1).max(120).optional(),
  })
  .refine((body) => Boolean(body.projectId) !== Boolean(body.leadId), {
    message: 'Choose a project or a lead.',
    path: ['projectId'],
  });
export type NewDocumentRequest = z.input<typeof newDocumentRequestSchema>;

/** "Not right, ask again": the staff note the customer sees on the reopened request. */
export const reaskDocumentRequestSchema = z.object({
  note: z.string().trim().min(2).max(300),
});
export type ReaskDocumentRequest = z.input<typeof reaskDocumentRequestSchema>;

/** What the customer sees: what to send, for which home, and whether it arrived. */
export const customerDocumentRequestSchema = z.object({
  id: idSchema,
  projectCode: z.string().nullable(),
  homeName: z.string().nullable(),
  category: z.enum(CUSTOMER_REQUESTABLE_CATEGORIES),
  title: z.string(),
  note: z.string(),
  /** A paper the team has checked still reads as received. */
  status: z.enum(['open', 'received', 'cancelled']),
  createdAt: z.string(),
  receivedAt: z.string().nullable(),
});
export type CustomerDocumentRequest = z.infer<typeof customerDocumentRequestSchema>;
