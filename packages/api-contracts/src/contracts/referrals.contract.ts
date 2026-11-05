import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  customerReferralProgramSchema,
  incentiveFilterSchema,
  payoutInputSchema,
  referralProgramInputSchema,
  referralProgramSchema,
  referralRewardSchema,
  rejectInputSchema,
  upiCheckInputSchema,
} from '../schemas/incentives.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * Refer and earn (PRD 5.6, 7.2): the owner's programme settings, and the rewards finance
 * approves and pays. Approval books a marketing expense; payment the bank movement.
 */
export const referralsContract = c.router({
  program: {
    method: 'GET',
    path: '/settings/referrals',
    responses: { 200: referralProgramSchema },
  },
  saveProgram: {
    method: 'PUT',
    path: '/settings/referrals',
    body: referralProgramInputSchema,
    responses: { 200: referralProgramSchema },
  },
  lookupCode: {
    method: 'GET',
    path: '/referral-codes/:code',
    pathParams: z.object({ code: z.string().trim().min(4).max(16) }),
    responses: { 200: z.object({ customerId: idSchema, name: z.string(), code: z.string() }) },
    summary: 'Who a referral code belongs to, for the lead form.',
  },
  listRewards: {
    method: 'GET',
    path: '/referral-rewards',
    query: z.object({ status: incentiveFilterSchema.default('open') }),
    responses: { 200: z.array(referralRewardSchema) },
  },
  approveReward: {
    method: 'POST',
    path: '/referral-rewards/:id/approve',
    pathParams: idParams,
    body: z.object({}),
    responses: { 200: referralRewardSchema },
  },
  rejectReward: {
    method: 'POST',
    path: '/referral-rewards/:id/reject',
    pathParams: idParams,
    body: rejectInputSchema,
    responses: { 200: referralRewardSchema },
  },
  checkRewardUpi: {
    method: 'POST',
    path: '/referral-rewards/:id/upi-check',
    pathParams: idParams,
    body: upiCheckInputSchema,
    responses: { 200: referralRewardSchema },
    summary: "Looks good, or Ask again, on the customer's UPI ID.",
  },
  payReward: {
    method: 'POST',
    path: '/referral-rewards/:id/pay',
    pathParams: idParams,
    body: payoutInputSchema,
    responses: { 200: referralRewardSchema },
  },
});

/** The customer app's refer-and-earn card: their code, the terms and their rewards. */
export const customerReferralsContract = c.router({
  referralProgram: {
    method: 'GET',
    path: '/customer/referral-program',
    responses: { 200: customerReferralProgramSchema },
  },
});
