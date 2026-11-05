import { z } from 'zod';
import { calendarDateSchema, idSchema, paiseSchema } from '../common/primitives';
import { moneyOutMethodSchema } from './finance.schema';

/** One payment made against a bill, by hand or by bank, as the "Payments on this bill" list shows it. */
export const payablePaymentSchema = z.object({
  id: idSchema,
  amountPaise: paiseSchema,
  method: moneyOutMethodSchema,
  paidOn: calendarDateSchema,
  reference: z.string().nullable(),
  /** Who recorded it; null for a bank transfer or a person who has left. */
  paidBy: z.string().nullable(),
  /** Made by a bank transfer: it comes back only through the bank. */
  bank: z.boolean(),
  reversed: z.boolean(),
  reversalReason: z.string().nullable(),
  /** Whether the person asking may undo it now. */
  canUndo: z.boolean(),
  createdAt: z.string(),
});
export type PayablePayment = z.infer<typeof payablePaymentSchema>;

export const undoPaymentBodySchema = z.object({
  reason: z.string().trim().min(5, 'Say why, in a few words.').max(500),
});
