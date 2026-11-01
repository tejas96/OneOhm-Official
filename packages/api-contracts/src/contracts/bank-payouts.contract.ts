import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { bankPayoutSchema, payoutOptionsSchema } from '../schemas/bank-payout.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** Pay approved bills straight to the payee's bank through RazorpayX (PRD 3.11). */
export const bankPayoutsContract = c.router({
  payoutOptions: {
    method: 'GET',
    path: '/payables/:id/payout-options',
    pathParams: idParams,
    responses: { 200: payoutOptionsSchema },
  },
  sendPayout: {
    method: 'POST',
    path: '/payables/:id/payouts',
    pathParams: idParams,
    body: z.object({}).optional(),
    responses: { 201: bankPayoutSchema },
    summary: 'Sends the bill balance to the payee bank; the bill is paid when it is processed.',
  },
  recentPayouts: {
    method: 'GET',
    path: '/payouts',
    responses: { 200: z.array(bankPayoutSchema) },
    summary: 'Payouts of the last 60 days, newest first, for status on the bills list.',
  },
});
