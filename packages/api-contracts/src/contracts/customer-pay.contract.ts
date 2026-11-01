import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

const c = initContract();

/** Where the customer pays what is still owed on one milestone. */
export const customerPayLinkSchema = z.object({
  url: z.string(),
  amountPaise: z.number().int(),
  /** The local practice page, not real Razorpay. */
  sandbox: z.boolean(),
});
export type CustomerPayLink = z.infer<typeof customerPayLinkSchema>;

/**
 * Pay from the customer app (PRD 5.3) even when the team never sent a link: the open link
 * is reused, or one is made for the balance. Only the customer's own share, once due.
 */
export const customerPayContract = c.router({
  payMilestone: {
    method: 'POST',
    path: '/customer/milestones/:id/pay',
    pathParams: z.object({ id: idSchema }),
    body: c.noBody(),
    responses: { 200: customerPayLinkSchema },
  },
});
