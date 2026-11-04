import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { pageOf, pageQuerySchema } from '../common/paging';
import { instantSchema } from '../common/primitives';
import { auditPageSchema, signInAttemptSchema } from '../schemas/audit.schema';

const c = initContract();

/** The audit trail and sign-in attempts, for owners and admins (PRD 7.3). */
export const auditContract = c.router({
  activity: {
    method: 'GET',
    path: '/audit',
    query: z.object({
      entity: z.string().trim().max(60).optional(),
      search: z.string().trim().max(120).optional(),
      before: instantSchema.optional(),
      /** The `cursor` of the page before: exact, so entries sharing a time are never skipped. */
      cursor: z.string().trim().max(120).optional(),
    }),
    responses: { 200: auditPageSchema },
  },
  signIns: {
    method: 'GET',
    path: '/audit/sign-ins',
    query: pageQuerySchema.extend({
      failedOnly: z.enum(['true', 'false']).optional(),
      /** Matches the account typed, the person's name or the address. */
      search: z.string().trim().max(120).optional(),
    }),
    responses: { 200: pageOf(signInAttemptSchema) },
  },
});
