import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { siteDistanceSchema } from '../schemas/costing.schema';
import {
  quotationDetailSchema,
  quotationInputSchema,
  quotationPreviewInputSchema,
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
    body: quotationPreviewInputSchema,
    responses: { 200: quotationPreviewSchema },
    summary:
      'Price, subsidy and effective cost instantly, with the DCR / non-DCR comparison. Works without a site on record.',
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
    // A revision says what changed (one short line); the customer reads it first.
    body: z.object({ whatChanged: z.string().trim().max(200).optional() }).optional(),
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
  siteDistance: {
    method: 'GET',
    path: '/properties/:id/site-distance',
    pathParams: idParams,
    responses: { 200: siteDistanceSchema },
    summary:
      'Road distance from the company base to the site, from GPS × the road factor; null when either point is unknown.',
  },
  setSubsidyClaimed: {
    method: 'PUT',
    path: '/properties/:id/subsidy-claimed',
    pathParams: idParams,
    body: z.object({ claimed: z.boolean() }),
    responses: { 200: z.object({ subsidyClaimed: z.boolean() }) },
    summary:
      'One subsidy per property (PRD 3.5): set when it was claimed elsewhere, or cleared when marked by mistake.',
  },
  rejectQuotation: {
    method: 'POST',
    path: '/quotations/:id/reject',
    pathParams: idParams,
    body: z.object({ reason: z.string().trim().min(2).max(300) }),
    responses: { 200: quotationDetailSchema },
  },
});
