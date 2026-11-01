import { HANDLING_STATUSES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, paiseSchema } from '../common/primitives';

/** A cash or cheque payment and where the money is now (PRD 3.11). */
export const handledPaymentSchema = z.object({
  paymentId: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  customer: z.string(),
  milestone: z.string().nullable(),
  method: z.enum(['cash', 'cheque']),
  amountPaise: paiseSchema,
  receivedOn: calendarDateSchema,
  receiptNumber: z.string().nullable(),
  collectedBy: z.object({ id: idSchema, name: z.string() }).nullable(),
  chequeNumber: z.string().nullable(),
  chequeBank: z.string().nullable(),
  chequeDate: calendarDateSchema.nullable(),
  status: z.enum(HANDLING_STATUSES),
  depositNumber: z.string().nullable(),
  clearedOn: calendarDateSchema.nullable(),
  bouncedOn: calendarDateSchema.nullable(),
  bounceReason: z.string().nullable(),
  daysHeld: z.number().int(),
});
export type HandledPayment = z.infer<typeof handledPaymentSchema>;

export const collectorSchema = z.object({
  userId: idSchema.nullable(),
  name: z.string().nullable(),
  totalPaise: paiseSchema,
  count: z.number().int(),
  oldestDays: z.number().int(),
});

/** Money collected but not yet in the bank: cash by who holds it, and open cheques. */
export const cashPositionSchema = z.object({
  cashInHandPaise: paiseSchema,
  chequesOpenPaise: paiseSchema,
  collectors: z.array(collectorSchema),
  open: z.array(handledPaymentSchema),
  /** Cash held longer than this is flagged. */
  alertDays: z.number().int(),
});
export type CashPosition = z.infer<typeof cashPositionSchema>;

export const moneyDepositSchema = z.object({
  id: idSchema,
  number: z.string(),
  depositedOn: calendarDateSchema,
  bankReference: z.string().nullable(),
  cashPaise: paiseSchema,
  chequePaise: paiseSchema,
  note: z.string(),
  depositedBy: z.string().nullable(),
  items: z.number().int(),
  createdAt: z.string(),
});
export type MoneyDeposit = z.infer<typeof moneyDepositSchema>;

export const newDepositSchema = z.object({
  depositedOn: calendarDateSchema,
  bankReference: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(300).default(''),
  paymentIds: z.array(idSchema).min(1).max(200),
});
export type NewDeposit = z.input<typeof newDepositSchema>;

export const clearChequeSchema = z.object({ clearedOn: calendarDateSchema });
export const bounceChequeSchema = z.object({
  bouncedOn: calendarDateSchema,
  reason: z.string().trim().min(3).max(200),
});
