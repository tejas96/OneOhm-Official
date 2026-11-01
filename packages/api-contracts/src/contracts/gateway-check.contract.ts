import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/** Ask Razorpay now about open payment links and payouts (it also runs every 5 minutes). */
export const gatewayCheckContract = c.router({
  checkGateway: {
    method: 'POST',
    path: '/finance/gateway/check',
    body: z.object({}).optional(),
    responses: {
      200: z.object({
        recorded: z.number().int(),
        closed: z.number().int(),
        payoutsUpdated: z.number().int(),
      }),
    },
  },
});
