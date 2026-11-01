import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { paymentPlanInputSchema, paymentPlanSchema } from '../schemas/payment-plan.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** Payment terms for new projects; changes never touch projects already created. */
export const paymentPlansContract = c.router({
  list: {
    method: 'GET',
    path: '/settings/payment-plans',
    responses: { 200: z.array(paymentPlanSchema) },
  },
  create: {
    method: 'POST',
    path: '/settings/payment-plans',
    body: paymentPlanInputSchema,
    responses: { 201: paymentPlanSchema },
  },
  update: {
    method: 'PUT',
    path: '/settings/payment-plans/:id',
    pathParams: idParams,
    body: paymentPlanInputSchema,
    responses: { 200: paymentPlanSchema },
  },
  makeDefault: {
    method: 'POST',
    path: '/settings/payment-plans/:id/default',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: z.array(paymentPlanSchema) },
  },
});
