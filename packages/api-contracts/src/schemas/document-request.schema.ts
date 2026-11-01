import {
  CUSTOMER_REQUESTABLE_CATEGORIES,
  DOCUMENT_REQUEST_STATUSES,
  DOCUMENT_REQUEST_TITLE_MAX,
} from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

export const documentRequestStatusSchema = z.enum(DOCUMENT_REQUEST_STATUSES);

/** A paper the team asked the customer for, as staff see it (PRD 5.4, 6.1). */
export const documentRequestSchema = z.object({
  id: idSchema,
  customerId: idSchema,
  projectId: idSchema.nullable(),
  projectCode: z.string().nullable(),
  category: z.enum(CUSTOMER_REQUESTABLE_CATEGORIES),
  title: z.string(),
  note: z.string(),
  status: documentRequestStatusSchema,
  documentId: idSchema.nullable(),
  requestedBy: z.string().nullable(),
  createdAt: z.string(),
  receivedAt: z.string().nullable(),
});
export type DocumentRequest = z.infer<typeof documentRequestSchema>;

export const documentRequestQuerySchema = z.object({
  projectId: idSchema.optional(),
  customerId: idSchema.optional(),
});
export type DocumentRequestQuery = z.infer<typeof documentRequestQuerySchema>;

export const newDocumentRequestSchema = z.object({
  projectId: idSchema,
  category: z.enum(CUSTOMER_REQUESTABLE_CATEGORIES),
  title: z.string().trim().min(2).max(DOCUMENT_REQUEST_TITLE_MAX),
  note: z.string().trim().max(300).default(''),
});
export type NewDocumentRequest = z.input<typeof newDocumentRequestSchema>;

/** What the customer sees: what to send, for which project, and whether it arrived. */
export const customerDocumentRequestSchema = z.object({
  id: idSchema,
  projectCode: z.string().nullable(),
  category: z.enum(CUSTOMER_REQUESTABLE_CATEGORIES),
  title: z.string(),
  note: z.string(),
  status: documentRequestStatusSchema,
  createdAt: z.string(),
  receivedAt: z.string().nullable(),
});
export type CustomerDocumentRequest = z.infer<typeof customerDocumentRequestSchema>;
