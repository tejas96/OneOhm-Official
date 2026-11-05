import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema, paiseSchema } from '../common/primitives';
import {
  bankPayoutSchema,
  payoutOptionsSchema,
  payoutRequestSchema,
  payoutSetupSchema,
  practiceOutcomeSchema,
} from '../schemas/bank-payout.schema';
import { payoutIpSchema, payoutMatchSchema } from '../schemas/payout-ip-match.schema';

const c = initContract();
const pdfResponse = c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() });
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
    body: z
      .object({
        /** A part of the bill; leave out to send all that is left. */
        amountPaise: paiseSchema.optional(),
      })
      .optional(),
    responses: { 201: bankPayoutSchema },
    summary:
      'Sends the bill balance (or a part of it) to the payee bank; the bill is paid when nothing is left.',
  },
  requestPayout: {
    method: 'POST',
    path: '/payables/:id/payout-request',
    pathParams: idParams,
    body: z.object({ amountPaise: paiseSchema.optional() }).optional(),
    responses: { 201: payoutRequestSchema },
    summary: 'Asks an approver to send a bank transfer for an approved bill (default: all left).',
  },
  withdrawPayoutRequest: {
    method: 'DELETE',
    path: '/payables/:id/payout-request',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 204: c.noBody() },
    summary: 'Takes back an ask to send; the asker or an approver may.',
  },
  declinePayoutRequest: {
    method: 'POST',
    path: '/payables/:id/payout-request/decline',
    pathParams: idParams,
    body: z.object({ note: z.string().trim().min(2, 'Say why.').max(500) }),
    responses: { 204: c.noBody() },
    summary: 'An approver says no to an ask to send, with a note the asker is told.',
  },
  releaseBankHold: {
    method: 'POST',
    path: '/payees/:kind/:id/bank-hold/release',
    pathParams: z.object({ kind: z.enum(['vendor', 'contractor']), id: idSchema }),
    body: c.noBody(),
    responses: { 204: c.noBody() },
    summary: 'Lets bank transfers go before the 24-hour hold ends; not the person who changed it.',
  },
  recentPayouts: {
    method: 'GET',
    path: '/payouts',
    responses: { 200: z.array(bankPayoutSchema) },
    summary: 'Payouts of the last 60 days, newest first, for status on the bills list.',
  },
  payoutSetup: {
    method: 'GET',
    path: '/payouts/setup',
    responses: { 200: payoutSetupSchema.merge(payoutIpSchema) },
    summary:
      'Setup check for RazorpayX: mode, what is set (never the values), last webhook and check, open and stuck payouts, and the server IP for the RazorpayX allow-list.',
  },
  payoutMatch: {
    method: 'GET',
    path: '/payouts/match',
    query: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }),
    responses: { 200: payoutMatchSchema },
    summary:
      "Compares our RazorpayX transfers of the last days with RazorpayX's own list. Needs finance.view or approve payments.",
  },
  payoutAdvice: {
    method: 'GET',
    path: '/payouts/:id/advice.pdf',
    pathParams: idParams,
    query: z.object({ disposition: z.enum(['inline', 'attachment']).default('attachment') }),
    responses: { 200: pdfResponse },
    summary:
      'Payment advice PDF for a processed payout (409 otherwise): payee, amount, UTR, last four digits of the account. Never the full account number.',
  },
  practicePayout: {
    method: 'POST',
    path: '/payouts/:id/practice',
    pathParams: idParams,
    body: practiceOutcomeSchema,
    responses: { 200: bankPayoutSchema },
    summary:
      'Practice mode only (404 otherwise): ends a practice payout as processed, failed or reversed through the same code as a real webhook. Needs approve payments. `id` is the payout id.',
  },
});
