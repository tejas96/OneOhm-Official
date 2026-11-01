import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  commissionEntrySchema,
  commissionRuleInputSchema,
  commissionRuleSchema,
  incentiveFilterSchema,
  payoutInputSchema,
  rejectInputSchema,
  resellerCustomerSchema,
  resellerEarningsSchema,
  resellerPerformanceSchema,
} from '../schemas/incentives.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const resellerParams = z.object({ resellerId: idSchema });

/**
 * Reseller commission (PRD 4.8, 3.3): rules, the entries finance approves and pays,
 * reseller performance, and the reseller's own customers and earnings in the field app.
 */
export const commissionsContract = c.router({
  performance: {
    method: 'GET',
    path: '/resellers/performance',
    responses: { 200: z.array(resellerPerformanceSchema) },
  },
  defaultRule: {
    method: 'GET',
    path: '/commission-rules/default',
    responses: { 200: commissionRuleSchema },
  },
  saveDefaultRule: {
    method: 'PUT',
    path: '/commission-rules/default',
    body: commissionRuleInputSchema,
    responses: { 200: commissionRuleSchema },
  },
  saveResellerRule: {
    method: 'PUT',
    path: '/commission-rules/resellers/:resellerId',
    pathParams: resellerParams,
    body: commissionRuleInputSchema,
    responses: { 200: commissionRuleSchema },
  },
  clearResellerRule: {
    method: 'DELETE',
    path: '/commission-rules/resellers/:resellerId',
    pathParams: resellerParams,
    body: c.noBody(),
    responses: { 200: commissionRuleSchema },
    summary: 'The reseller goes back to the default rule.',
  },
  listEntries: {
    method: 'GET',
    path: '/commissions',
    query: z.object({
      status: incentiveFilterSchema.default('open'),
      resellerId: idSchema.optional(),
    }),
    responses: { 200: z.array(commissionEntrySchema) },
  },
  approveEntry: {
    method: 'POST',
    path: '/commissions/:id/approve',
    pathParams: idParams,
    body: z.object({}),
    responses: { 200: commissionEntrySchema },
  },
  rejectEntry: {
    method: 'POST',
    path: '/commissions/:id/reject',
    pathParams: idParams,
    body: rejectInputSchema,
    responses: { 200: commissionEntrySchema },
  },
  payEntry: {
    method: 'POST',
    path: '/commissions/:id/pay',
    pathParams: idParams,
    body: payoutInputSchema,
    responses: { 200: commissionEntrySchema },
  },
  myEarnings: {
    method: 'GET',
    path: '/me/commission',
    responses: { 200: resellerEarningsSchema },
  },
  myCustomers: {
    method: 'GET',
    path: '/me/customers',
    responses: { 200: z.array(resellerCustomerSchema) },
  },
});
