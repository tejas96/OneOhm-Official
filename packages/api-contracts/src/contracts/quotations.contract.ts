import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  quotationDetailSchema,
  quotationInputSchema,
  quotationPreviewSchema,
  quotationStatusSchema,
  quotationSummarySchema,
} from '../schemas/quotation.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

export const quotationsContract = c.router({
  previewQuotation: {
    method: 'POST',
    path: '/quotations/preview',
    body: quotationInputSchema,
    responses: { 200: quotationPreviewSchema },
    summary: 'Price, subsidy and effective cost instantly, with the DCR / non-DCR comparison.',
  },
  createQuotation: {
    method: 'POST',
    path: '/quotations',
    body: quotationInputSchema,
    responses: { 201: quotationDetailSchema },
  },
  listQuotations: {
    method: 'GET',
    path: '/quotations',
    query: z.object({ status: quotationStatusSchema.optional() }),
    responses: { 200: z.array(quotationSummarySchema) },
  },
  getQuotation: {
    method: 'GET',
    path: '/quotations/:id',
    pathParams: idParams,
    responses: { 200: quotationDetailSchema },
  },
  approveDiscount: {
    method: 'POST',
    path: '/quotations/:id/approve-discount',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: quotationDetailSchema },
  },
  sendQuotation: {
    method: 'POST',
    path: '/quotations/:id/send',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: quotationDetailSchema },
    summary: 'Marks it sent and queues the WhatsApp message with the PDF link.',
  },
  acceptQuotation: {
    method: 'POST',
    path: '/quotations/:id/accept',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: quotationDetailSchema },
  },
  rejectQuotation: {
    method: 'POST',
    path: '/quotations/:id/reject',
    pathParams: idParams,
    body: z.object({ reason: z.string().trim().min(2).max(300) }),
    responses: { 200: quotationDetailSchema },
  },
});
