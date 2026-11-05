import { PAYEE_TOLD, PAYOUT_PHASES, PAYOUT_STATUSES } from '@oneohm/domain';
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
  /** The GST inside the fee (the fee already includes it). */
  feeTaxPaise: paiseSchema,
  utr: z.string().nullable(),
  failureReason: z.string().nullable(),
  failureCode: z.string().nullable(),
  /** True when failureReason is the bank's or RazorpayX's words; false when it is OneOhm's own plain text. */
  failureFromBank: z.boolean(),
  /** When OneOhm last asked RazorpayX about it. */
  lastCheckedAt: z.string().nullable(),
  /** Plain stage: sending, on its way, paid, failed or came back. */
  phase: z.enum(PAYOUT_PHASES),
  accountMasked: z.string(),
  /** Who was paid, as the bill names them (for "Copy payment details"). */
  payeeName: z.string(),
  /** The day the money reached the payee, YYYY-MM-DD; null until paid. */
  paidOn: z.string().nullable(),
  /**
   * Whether the payee was told they were paid, by WhatsApp: `sent`, `off` (the message is
   * switched off in Settings) or `no_phone`. Null until the payout is paid. For `off` and
   * `no_phone` the screen says "Payee not told".
   */
  payeeTold: z.enum(PAYEE_TOLD).nullable(),
  /** It failed for lack of money in the RazorpayX balance: add money, then pay again. */
  lowBalance: z.boolean(),
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
  /** The payee's saved bank details changed less than 24 hours ago. */
  'bank_on_hold',
] as const;

/** An "ask to send" waiting for an approver. */
export const payoutRequestSchema = z.object({
  id: idSchema,
  amountPaise: paiseSchema,
  requestedByUserId: idSchema.nullable(),
  requestedByName: z.string().nullable(),
  requestedAt: z.string(),
  /** True when the viewer is the one who asked. */
  mine: z.boolean(),
});
export type PayoutRequest = z.infer<typeof payoutRequestSchema>;

/** The hold after the payee's bank details changed. */
export const bankHoldSchema = z.object({
  until: z.string(),
  changedByName: z.string().nullable(),
  /** The viewer approves payments and did not make the change. */
  canRelease: z.boolean(),
  text: z.string(),
});

/** The two-people rule for this bill, before anyone clicks. */
export const secondPersonSchema = z.object({
  /** The amount is above the limit in Settings, so a second person must take part. */
  needed: z.boolean(),
  /** Someone other than the viewer already approved the bill or asked to send it. */
  met: z.boolean(),
  /** Plain words naming who can help; set when it is needed and not met. */
  text: z.string().nullable(),
});

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
  /** What is left to pay: the most that can be sent, and the default amount. */
  leftPaise: paiseSchema,
  amountPaise: paiseSchema,
  transferMode: z.enum(['IMPS', 'NEFT']),
  latest: bankPayoutSchema.nullable(),
  /** Plain words for `problem` (with the time of a hold), ready to show. */
  problemText: z.string().nullable(),
  /** The open "ask to send", if any (one per bill). */
  request: payoutRequestSchema.nullable(),
  /** The viewer may send it now (approves payments). */
  canSend: z.boolean(),
  /** The viewer may ask an approver to send it (records payments, cannot send). */
  canAsk: z.boolean(),
  hold: bankHoldSchema.nullable(),
  secondPerson: secondPersonSchema,
  /**
   * The RazorpayX fee for one payout and its GST (18%), both in paise, from the fee in
   * Settings. Null when the owner has not entered the fee: say it is shown after sending.
   */
  feeEstimate: z.object({ feePaise: paiseSchema, gstPaise: paiseSchema }).nullable(),
});
export type PayoutOptions = z.infer<typeof payoutOptionsSchema>;

/** Practice mode only: how a practice payout should end. */
export const PRACTICE_OUTCOMES = ['processed', 'failed', 'reversed'] as const;
export const practiceOutcomeSchema = z.object({ outcome: z.enum(PRACTICE_OUTCOMES) });

/** Is the RazorpayX setup right? Values only, never a key or secret. */
export const payoutSetupSchema = z.object({
  mode: z.enum(['off', 'sandbox', 'live']),
  accountNumberSet: z.boolean(),
  keysSet: z.boolean(),
  /** The key id starts with rzp_test_: live mode should not use it. */
  keysAreTest: z.boolean(),
  webhookSecretSet: z.boolean(),
  /** When RazorpayX last sent a payout event. */
  lastWebhookAt: z.string().nullable(),
  /** When OneOhm last asked RazorpayX about open payouts. */
  lastCheckAt: z.string().nullable(),
  /** The reason the latest check failed; null when it worked. */
  lastCheckError: z.string().nullable(),
  /** Payouts still on their way. */
  openPayouts: z.number().int(),
  /** Open payouts that have taken longer than they should. */
  stuckPayouts: z.number().int(),
  /** The last time a payout failed for lack of balance. */
  lastLowBalanceAt: z.string().nullable(),
  /** The last time a payout reached the payee. */
  lastGoodPayoutAt: z.string().nullable(),
});
export type PayoutSetup = z.infer<typeof payoutSetupSchema>;
