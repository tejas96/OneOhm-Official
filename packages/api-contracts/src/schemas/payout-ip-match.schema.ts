import { z } from 'zod';

/** What the allow-list step in RazorpayX needs (live mode only; else null / false). */
export const payoutIpSchema = z.object({
  /** This server's public IP, looked up at most once an hour; null if unknown or not live. */
  serverIp: z.string().nullable(),
  /** The last RazorpayX error was "this server's IP is not on the allow-list". */
  ipBlocked: z.boolean(),
});
export type PayoutIp = z.infer<typeof payoutIpSchema>;

export const payoutMatchLineSchema = z.object({
  kind: z.enum(['only_razorpayx', 'only_oneohm', 'status', 'amount', 'fee']),
  /** The bill to open; null when only RazorpayX knows the transfer. */
  payableId: z.string().nullable(),
  text: z.string(),
});

/** OneOhm's bank transfers against RazorpayX's list for the last days. */
export const payoutMatchSchema = z.object({
  days: z.number().int(),
  /** Transfers that agree on both sides. */
  matched: z.number().int(),
  /** How many lines of each kind (all of them, even past the 50 shown). */
  counts: z.object({
    only_razorpayx: z.number().int(),
    only_oneohm: z.number().int(),
    status: z.number().int(),
    amount: z.number().int(),
    fee: z.number().int(),
  }),
  lines: z.array(payoutMatchLineSchema),
  /** True when there were more than the lines shown. */
  truncated: z.boolean(),
  /** True in practice mode, where the "RazorpayX side" is our own rows. */
  practice: z.boolean(),
});
export type PayoutMatch = z.infer<typeof payoutMatchSchema>;
