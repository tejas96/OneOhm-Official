import { PAYOUT_STATUSES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, paiseSchema } from '../common/primitives';

/** One bank transfer of a bill through RazorpayX (PRD 3.11). */
export const bankPayoutSchema = z.object({
  id: idSchema,
  payableId: idSchema,
  status: z.enum(PAYOUT_STATUSES),
  mode: z.string(),
  amountPaise: paiseSchema,
  feePaise: paiseSchema,
  utr: z.string().nullable(),
  failureReason: z.string().nullable(),
  accountMasked: z.string(),
  sandbox: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BankPayout = z.infer<typeof bankPayoutSchema>;

export const PAYOUT_PROBLEMS = [
  'not_enabled',
  'not_approved',
  'no_payee',
  'no_bank_details',
  'bad_bank_details',
  'nothing_due',
  'already_sending',
] as const;

/** Whether a bill can go by bank transfer now, to whom, and why not if it cannot. */
export const payoutOptionsSchema = z.object({
  mode: z.enum(['off', 'sandbox', 'live']),
  payee: z
    .object({
      kind: z.enum(['vendor', 'contractor']),
      id: idSchema,
      name: z.string(),
      accountName: z.string().nullable(),
      accountMasked: z.string().nullable(),
      ifsc: z.string().nullable(),
    })
    .nullable(),
  problem: z.enum(PAYOUT_PROBLEMS).nullable(),
  amountPaise: paiseSchema,
  transferMode: z.enum(['IMPS', 'NEFT']),
  latest: bankPayoutSchema.nullable(),
});
export type PayoutOptions = z.infer<typeof payoutOptionsSchema>;
