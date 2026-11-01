import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { leadStageSchema } from './crm.schema';
import { SERVICE_CATEGORIES } from './customer-portal.schema';
import { changeRequestSummarySchema } from './discom.schema';
import { moneyInMethodSchema, payerSchema } from './finance.schema';
import { SERVICE_STATUSES } from './service-desk.schema';
import { chatMessageSchema, DELIVERY_STATES } from './whatsapp.schema';

const projectRefSchema = z.object({ id: idSchema, code: z.string() });

/** One receivable on a project, with what came in against it (reversals net off). */
export const customerMilestoneSchema = z.object({
  id: idSchema,
  label: z.string(),
  payer: payerSchema,
  amountPaise: paiseSchema,
  paidPaise: paiseSchema,
  outstandingPaise: paiseSchema,
  status: z.enum(['upcoming', 'due', 'partly_paid', 'paid']),
  dueOn: calendarDateSchema.nullable(),
});
export type CustomerMilestone = z.infer<typeof customerMilestoneSchema>;

export const customerProjectMoneySchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  status: z.enum(['active', 'operational', 'completed', 'cancelled']),
  totalPaise: paiseSchema,
  /** Credited by the government after commissioning; never a receivable. */
  subsidyPaise: paiseSchema,
  milestones: z.array(customerMilestoneSchema),
});
export type CustomerProjectMoney = z.infer<typeof customerProjectMoneySchema>;

export const customerPaymentSchema = z.object({
  id: idSchema,
  receiptNumber: z.string().nullable(),
  project: projectRefSchema,
  milestoneLabel: z.string().nullable(),
  payer: payerSchema,
  method: moneyInMethodSchema,
  amountPaise: paiseSchema,
  receivedOn: calendarDateSchema,
  reference: z.string().nullable(),
  /** A later row reversed this one. */
  reversed: z.boolean(),
  /** This row is itself a reversal (negative amount). */
  reversal: z.boolean(),
});
export type CustomerPayment = z.infer<typeof customerPaymentSchema>;

/** The customer's WhatsApp chat (matched by phone), latest messages oldest first. */
export const customerChatSchema = z.object({
  id: idSchema,
  state: z.string(),
  lastInboundAt: instantSchema.nullable(),
  messageCount: z.number().int(),
  messages: z.array(chatMessageSchema),
});
export type CustomerChat = z.infer<typeof customerChatSchema>;

/** A business message from the outbox: WhatsApp or SMS to their phone, or a push alert. */
export const customerOutboundSchema = z.object({
  id: idSchema,
  channel: z.enum(['whatsapp', 'sms', 'push']),
  template: z.string(),
  /** Push only: the alert's title. */
  title: z.string().nullable(),
  state: z.enum(DELIVERY_STATES),
  lastError: z.string().nullable(),
  createdAt: instantSchema,
});
export type CustomerOutbound = z.infer<typeof customerOutboundSchema>;

/** An alert in the customer app's inbox. */
export const customerAlertSchema = z.object({
  id: idSchema,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: instantSchema,
  readAt: instantSchema.nullable(),
});
export type CustomerAlert = z.infer<typeof customerAlertSchema>;

export const customerServiceRequestSchema = z.object({
  id: idSchema,
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string(),
  status: z.enum(SERVICE_STATUSES),
  project: projectRefSchema.nullable(),
  assigneeName: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  createdAt: instantSchema,
  resolvedAt: instantSchema.nullable(),
});
export type CustomerServiceRequest = z.infer<typeof customerServiceRequestSchema>;

export const customerFeedbackSchema = z.object({
  id: idSchema,
  rating: z.number().int(),
  comment: z.string().nullable(),
  project: projectRefSchema,
  createdAt: instantSchema,
});
export type CustomerFeedback = z.infer<typeof customerFeedbackSchema>;

/** A lead this customer referred, and how far it got. */
export const customerReferralSchema = z.object({
  id: idSchema,
  name: z.string(),
  city: z.string(),
  stage: leadStageSchema,
  /** Set once the lead became a customer. */
  customerId: idSchema.nullable(),
  createdAt: instantSchema,
});
export type CustomerReferral = z.infer<typeof customerReferralSchema>;

/** Everything else the customer 360 shows, read-only (PRD 3.2). */
export const customerActivitySchema = z.object({
  projects: z.array(customerProjectMoneySchema),
  payments: z.array(customerPaymentSchema),
  chat: customerChatSchema.nullable(),
  outbound: z.array(customerOutboundSchema),
  alerts: z.array(customerAlertSchema),
  changeRequests: z.array(changeRequestSummarySchema),
  serviceRequests: z.array(customerServiceRequestSchema),
  feedback: z.array(customerFeedbackSchema),
  referrals: z.array(customerReferralSchema),
});
export type CustomerActivity = z.infer<typeof customerActivitySchema>;
