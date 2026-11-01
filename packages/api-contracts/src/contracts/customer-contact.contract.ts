import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  customerContactSchema,
  customerContactUpdateSchema,
  handoverSchema,
} from '../schemas/customer-contact.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** WhatsApp first, SMS second, in person last (owner's rule). */
export const customerContactContract = c.router({
  customerContact: {
    method: 'GET',
    path: '/customers/:id/contact',
    pathParams: idParams,
    responses: { 200: customerContactSchema },
  },
  setCustomerContact: {
    method: 'PATCH',
    path: '/customers/:id/contact',
    pathParams: idParams,
    body: customerContactUpdateSchema,
    responses: { 200: customerContactSchema },
  },
  listHandovers: {
    method: 'GET',
    path: '/handovers',
    query: z.object({
      customerId: idSchema.optional(),
      status: z.enum(['open', 'done']).default('open'),
    }),
    responses: { 200: z.array(handoverSchema) },
  },
  completeHandover: {
    method: 'POST',
    path: '/handovers/:id/done',
    pathParams: idParams,
    body: z.object({ note: z.string().trim().max(300).optional() }),
    responses: { 200: handoverSchema },
  },
});
