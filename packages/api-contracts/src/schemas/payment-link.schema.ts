import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';

export const PAYMENT_LINK_STATUSES = [
  'created',
  'partly_paid',
  'paid',
  'expired',
  'cancelled',
] as const;

/** An online payment link for one customer milestone (PRD 3.11, 5.3). */
export const paymentLinkSchema = z.object({
  id: idSchema,
  milestoneId: idSchema,
  projectId: idSchema,
  url: z.string(),
  amountPaise: paiseSchema,
  paidPaise: paiseSchema,
  status: z.enum(PAYMENT_LINK_STATUSES),
  /** A local test link (no Razorpay keys yet); paying it records a test payment. */
  sandbox: z.boolean(),
  createdAt: instantSchema,
  expiresAt: instantSchema.nullable(),
});
export type PaymentLink = z.infer<typeof paymentLinkSchema>;

/** The link still open on a milestone, shown beside it; paid and closed links drop off. */
export const openLinkSchema = paymentLinkSchema
  .pick({ id: true, url: true, amountPaise: true, status: true, sandbox: true, createdAt: true })
  .nullable();
export type OpenLink = z.infer<typeof openLinkSchema>;

/** Whether online links can be sent: off, a local sandbox, or live Razorpay. */
export const onlinePaymentsSetupSchema = z.object({
  mode: z.enum(['off', 'sandbox', 'live']),
  linkDays: z.number().int(),
});
export type OnlinePaymentsSetup = z.infer<typeof onlinePaymentsSetupSchema>;

export const gatewaySettlementSchema = z.object({
  id: idSchema,
  providerSettlementId: z.string(),
  amountPaise: paiseSchema,
  feesPaise: paiseSchema,
  taxPaise: paiseSchema,
  utr: z.string().nullable(),
  settledOn: calendarDateSchema,
});
export type GatewaySettlement = z.infer<typeof gatewaySettlementSchema>;
