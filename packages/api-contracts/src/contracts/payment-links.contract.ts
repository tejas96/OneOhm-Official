import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  gatewaySettlementSchema,
  onlinePaymentsSetupSchema,
  paymentLinkSchema,
} from '../schemas/payment-link.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * Online payment links for customer milestones (Razorpay). The gateway's webhook is a
 * plain route outside this contract because its signature is checked on the raw body.
 */
export const paymentLinksContract = c.router({
  setup: {
    method: 'GET',
    path: '/finance/online-payments',
    responses: { 200: onlinePaymentsSetupSchema },
  },
  create: {
    method: 'POST',
    path: '/finance/milestones/:id/payment-link',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 201: paymentLinkSchema },
    summary: 'Creates a link for what is still owed, or returns the open one, and sends it.',
  },
  cancel: {
    method: 'POST',
    path: '/finance/payment-links/:id/cancel',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: paymentLinkSchema },
  },
  settlements: {
    method: 'GET',
    path: '/finance/settlements',
    responses: { 200: z.array(gatewaySettlementSchema) },
  },
});
