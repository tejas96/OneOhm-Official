import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  customerDocumentRequestSchema,
  documentRequestQuerySchema,
  documentRequestSchema,
  newDocumentRequestSchema,
  reaskDocumentRequestSchema,
} from '../schemas/document-request.schema';
import { reportKeySchema } from './reports.contract';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** Staff ask a customer for a paper; the customer gets WhatsApp and an app alert. */
export const documentRequestsContract = c.router({
  listDocumentRequests: {
    method: 'GET',
    path: '/document-requests',
    query: documentRequestQuerySchema,
    responses: { 200: z.array(documentRequestSchema) },
    summary: 'Requests for one project or customer, open first.',
  },
  createDocumentRequest: {
    method: 'POST',
    path: '/document-requests',
    body: newDocumentRequestSchema,
    responses: { 201: documentRequestSchema },
    summary: 'Asks the project customer for a paper they hold (needs documents.upload).',
  },
  cancelDocumentRequest: {
    method: 'POST',
    path: '/document-requests/:id/cancel',
    pathParams: idParams,
    body: z.object({}).optional(),
    responses: { 200: documentRequestSchema },
  },
  reaskDocumentRequest: {
    method: 'POST',
    path: '/document-requests/:id/reask',
    pathParams: idParams,
    body: reaskDocumentRequestSchema,
    responses: { 200: documentRequestSchema },
    summary: 'Not right, ask again: reopens a received request; the paper is taken off.',
  },
});

/** The customer's side: what was asked, and the upload that answers it (PRD 5.4). */
export const customerDocumentRequestsContract = c.router({
  listMyDocumentRequests: {
    method: 'GET',
    path: '/customer/document-requests',
    responses: { 200: z.array(customerDocumentRequestSchema) },
  },
  answerDocumentRequest: {
    method: 'POST',
    path: '/customer/document-requests/:id/file',
    pathParams: idParams,
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: customerDocumentRequestSchema },
    summary: 'One photo or PDF (field "file"); it is filed in the project documents.',
  },
});

export const reportSettingSchema = z.object({
  key: reportKeySchema,
  name: z.string(),
  customerVisible: z.boolean(),
  /** The built-in choice, used until someone changes it. */
  defaultVisible: z.boolean(),
  /** Saved to the project documents by itself when its trigger task is done. */
  autoGenerate: z.boolean(),
  /** The tasks that trigger it in the task library (Settings → Task templates). */
  triggers: z.array(z.string()),
});
export type ReportSetting = z.infer<typeof reportSettingSchema>;

/** Which statutory reports the customer sees, and which are saved by themselves (PRD 3.18). */
export const reportSettingsContract = c.router({
  listReportSettings: {
    method: 'GET',
    path: '/report-settings',
    responses: { 200: z.array(reportSettingSchema) },
  },
  updateReportSetting: {
    method: 'PATCH',
    path: '/report-settings/:key',
    pathParams: z.object({ key: reportKeySchema }),
    body: z.object({
      customerVisible: z.boolean().optional(),
      autoGenerate: z.boolean().optional(),
    }),
    responses: { 200: reportSettingSchema },
  },
});
