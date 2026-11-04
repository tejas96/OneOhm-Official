import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { documentRequestSchema } from '../schemas/document-request.schema';
import {
  sendBodySchema,
  sendOptionsSchema,
  sendPreviewSchema,
  sendResultSchema,
  sendScopeSchema,
} from '../schemas/send-to-customer.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** The staff "Send to customer" menu (redesign §18): what fits a place, a preview and the send. */
export const sendToCustomerContract = c.router({
  sendOptions: {
    method: 'GET',
    path: '/send-to-customer/options',
    query: sendScopeSchema,
    responses: { 200: sendOptionsSchema },
    summary: 'The actions that fit this place, each with what the customer would get.',
  },
  sendPreview: {
    method: 'POST',
    path: '/send-to-customer/preview',
    body: sendBodySchema,
    responses: { 200: sendPreviewSchema },
  },
  sendToCustomer: {
    method: 'POST',
    path: '/send-to-customer',
    body: sendBodySchema,
    responses: { 201: sendResultSchema },
    summary: 'Sends one action; each asked action is a customer action with its own card.',
  },
  acceptLocation: {
    method: 'POST',
    path: '/customer-actions/:id/location/accept',
    pathParams: idParams,
    body: z.object({}).optional(),
    responses: { 200: documentRequestSchema },
    summary: 'Use the location the customer sent for this home.',
  },
  ignoreLocation: {
    method: 'POST',
    path: '/customer-actions/:id/location/ignore',
    pathParams: idParams,
    body: z.object({}).optional(),
    responses: { 200: documentRequestSchema },
    summary: 'Keep the location the home has; the customer pin is set aside.',
  },
});
