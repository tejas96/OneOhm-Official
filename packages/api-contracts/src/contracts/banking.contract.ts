import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/** A bank branch found by its IFSC. */
export const ifscBranchSchema = z.object({
  ifsc: z.string(),
  bank: z.string(),
  branch: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});
export type IfscBranch = z.infer<typeof ifscBranchSchema>;

/** `available: false` means the lookup service could not be reached; saving is not blocked. */
export const ifscLookupSchema = z.object({
  available: z.boolean(),
  branch: ifscBranchSchema.nullable(),
});
export type IfscLookup = z.infer<typeof ifscLookupSchema>;

export const bankingContract = c.router({
  ifsc: {
    method: 'GET',
    path: '/banking/ifsc/:code',
    pathParams: z.object({ code: z.string().trim().toUpperCase().length(11) }),
    responses: { 200: ifscLookupSchema },
    summary:
      'Which bank branch an IFSC belongs to (Razorpay public IFSC list, kept 24 hours). 404 when no branch has it.',
  },
});
