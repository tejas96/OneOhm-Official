import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  purchaseRequestInputSchema,
  purchaseRequestSchema,
  purchaseRequestStatusSchema,
  requestDecisionSchema,
  requestOrderInputSchema,
  requestRejectionSchema,
  vendorAdvanceInputSchema,
  vendorAdvancePaySchema,
  vendorAdvanceSchema,
  vendorAdvanceStatusSchema,
  vendorProfileSchema,
  vendorScorecardSchema,
} from '../schemas/purchasing.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** Requests for material: raised by stock and project people, decided by procurement. */
const requests = c.router({
  list: {
    method: 'GET',
    path: '/inventory/purchase-requests',
    query: z.object({
      status: purchaseRequestStatusSchema.optional(),
      projectId: idSchema.optional(),
    }),
    responses: { 200: z.array(purchaseRequestSchema) },
  },
  get: {
    method: 'GET',
    path: '/inventory/purchase-requests/:id',
    pathParams: idParams,
    responses: { 200: purchaseRequestSchema },
  },
  create: {
    method: 'POST',
    path: '/inventory/purchase-requests',
    body: purchaseRequestInputSchema,
    responses: { 201: purchaseRequestSchema },
    summary: 'Procurement is alerted to the new request.',
  },
  approve: {
    method: 'POST',
    path: '/inventory/purchase-requests/:id/approve',
    pathParams: idParams,
    body: requestDecisionSchema,
    responses: { 200: purchaseRequestSchema },
  },
  reject: {
    method: 'POST',
    path: '/inventory/purchase-requests/:id/reject',
    pathParams: idParams,
    body: requestRejectionSchema,
    responses: { 200: purchaseRequestSchema },
  },
  cancel: {
    method: 'POST',
    path: '/inventory/purchase-requests/:id/cancel',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: purchaseRequestSchema },
  },
  order: {
    method: 'POST',
    path: '/inventory/purchase-requests/:id/order',
    pathParams: idParams,
    body: requestOrderInputSchema,
    responses: { 201: purchaseRequestSchema },
    summary: 'Turns an approved request into a draft purchase order.',
  },
});

/** Advances to vendors against a purchase order: recorded, approved, then paid. */
const advances = c.router({
  list: {
    method: 'GET',
    path: '/finance/vendor-advances',
    query: z.object({
      status: z.union([vendorAdvanceStatusSchema, z.enum(['open', 'all'])]).default('open'),
      vendorId: idSchema.optional(),
      purchaseOrderId: idSchema.optional(),
    }),
    responses: { 200: z.array(vendorAdvanceSchema) },
  },
  create: {
    method: 'POST',
    path: '/finance/vendor-advances',
    body: vendorAdvanceInputSchema,
    responses: { 201: vendorAdvanceSchema },
  },
  approve: {
    method: 'POST',
    path: '/finance/vendor-advances/:id/approve',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: vendorAdvanceSchema },
  },
  pay: {
    method: 'POST',
    path: '/finance/vendor-advances/:id/pay',
    pathParams: idParams,
    body: vendorAdvancePaySchema,
    responses: { 200: vendorAdvanceSchema },
    summary: 'Pays the advance; it is set against any approved bill on the order.',
  },
  cancel: {
    method: 'POST',
    path: '/finance/vendor-advances/:id/cancel',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: vendorAdvanceSchema },
  },
});

/** How each vendor delivers and what is owed to them. */
const vendorPerformance = c.router({
  scorecards: {
    method: 'GET',
    path: '/inventory/vendor-scorecards',
    responses: { 200: z.array(vendorScorecardSchema) },
  },
  profile: {
    method: 'GET',
    path: '/inventory/vendors/:id/profile',
    pathParams: idParams,
    responses: { 200: vendorProfileSchema },
  },
});

export const purchasingContract = c.router({ requests, advances, vendorPerformance });
