import { SEND_ACTIONS } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

/** Where "Send to customer" is pressed: the customer, a project, a lead, a task or a chat. */
export const sendScopeSchema = z.object({
  customerId: idSchema.optional(),
  projectId: idSchema.optional(),
  leadId: idSchema.optional(),
  taskId: idSchema.optional(),
  serviceRequestId: idSchema.optional(),
});
export type SendScope = z.infer<typeof sendScopeSchema>;

export const sendActionSchema = z.enum(SEND_ACTIONS);

/** One thing to send, with the details that pick it. The server checks each one again. */
export const sendRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ask_location'), propertyId: idSchema }),
  /** `paperId` is the id a customer's paper list gives, or `document:<id>` for one file. */
  z.object({ action: z.literal('send_document'), paperId: z.string().min(3).max(200) }),
  z.object({ action: z.literal('payment_reminder'), milestoneId: idSchema }),
  z.object({ action: z.literal('ask_payment_proof'), milestoneId: idSchema }),
  z.object({ action: z.literal('send_receipt'), paymentId: idSchema }),
  z.object({
    action: z.literal('share_crew'),
    userId: idSchema,
    work: z.string().trim().min(2).max(80),
  }),
  z.object({
    action: z.literal('delay_notice'),
    taskId: idSchema,
    reason: z.string().trim().min(2).max(200),
  }),
  z.object({ action: z.literal('ask_callback') }),
  /** Ask the customer to pick a day for a task's visit, a lead's survey or a service request. */
  z.object({
    action: z.literal('ask_visit'),
    taskId: idSchema.optional(),
    leadId: idSchema.optional(),
    serviceRequestId: idSchema.optional(),
  }),
  /** A paper (or report) the customer reads and agrees to; a task with a signature step takes the signed copy. */
  z.object({
    action: z.literal('send_signature'),
    paperId: z.string().min(3).max(200),
    taskId: idSchema.optional(),
  }),
  /** "Is the roof ready?" before dispatch; `taskId` is the dispatch task. */
  z.object({ action: z.literal('ask_site_ready'), taskId: idSchema }),
  /** "Is the installation finished to your satisfaction?"; `taskId` is the installation task. */
  z.object({ action: z.literal('ask_installation_check'), taskId: idSchema }),
  /** Every handover paper in one go. */
  z.object({ action: z.literal('send_handover_pack'), projectId: idSchema }),
  /** "Please register on the PM Surya Ghar portal" for a subsidy task. */
  z.object({ action: z.literal('ask_subsidy_register'), taskId: idSchema }),
  /** "Did the subsidy reach your bank account?" for the subsidy release task. */
  z.object({ action: z.literal('ask_subsidy_credit'), taskId: idSchema }),
  /** "Please visit {bank}, {branch} on {day} to sign the loan papers"; `day` is YYYY-MM-DD. */
  z.object({
    action: z.literal('ask_bank_sign'),
    projectId: idSchema,
    branch: z.string().trim().min(2).max(80),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  /** The roof layout (a report or an uploaded document) to look at and approve; `taskId` is the design task. */
  z.object({
    action: z.literal('send_layout'),
    paperId: z.string().min(3).max(200),
    taskId: idSchema,
  }),
  /** The self site survey with a discount, offered from the project's survey step. */
  z.object({ action: z.literal('self_survey'), taskId: idSchema }),
  /** The rating still waiting (a finished stage or a resolved problem) asked again; never a second one. */
  z.object({ action: z.literal('ask_rating'), actionId: idSchema }),
  /** The AMC renewal offer for a contract that is ending (marketing; skipped after STOP). */
  z.object({ action: z.literal('amc_renewal'), contractId: idSchema }),
  /** The UPI ID of an approved reward asked again (a payout ask still waiting for the customer). */
  z.object({ action: z.literal('ask_upi'), actionId: idSchema }),
]);
export type SendRequest = z.infer<typeof sendRequestSchema>;

export const sendBodySchema = z.object({
  scope: sendScopeSchema,
  request: sendRequestSchema,
  /** One id per press of Send: a double tap or a retry of the same press sends once. */
  requestId: idSchema.optional(),
});
export type SendBody = z.infer<typeof sendBodySchema>;

/** What the customer gets: the words, the buttons, and how it travels. */
export const sendPreviewSchema = z.object({
  body: z.string(),
  buttons: z.array(z.string()),
  /** Inside the 24-hour window the chat message goes; outside it an approved template. */
  via: z.enum(['chat', 'template']),
  /** The customer's language, as the words are written in it. */
  language: z.enum(['en', 'mr', 'hi']),
  /** A line for staff when something is different (the template is not switched on yet). */
  note: z.string().nullable(),
});
export type SendPreview = z.infer<typeof sendPreviewSchema>;

export const sendOfferSchema = z.object({
  /** Unique within the list. */
  key: z.string(),
  action: sendActionSchema,
  label: z.string(),
  detail: z.string(),
  /** What to post to send it; free-text inputs are filled in by the person first. */
  request: sendRequestSchema.nullable(),
  /** `reason` for a delay notice; `bank_visit` when the person gives the branch and the day. */
  input: z.enum(['reason', 'bank_visit']).nullable(),
  preview: sendPreviewSchema.nullable(),
});
export type SendOffer = z.infer<typeof sendOfferSchema>;

export const sendOptionsSchema = z.object({
  customerName: z.string(),
  /** The person can ask for a paper from here (the existing ask sheet opens). */
  canAskPaper: z.boolean(),
  offers: z.array(sendOfferSchema),
  /** Why nothing can be sent, such as a lead with no site yet. */
  empty: z.string().nullable(),
});
export type SendOptions = z.infer<typeof sendOptionsSchema>;

export const sendResultSchema = z.object({
  via: z.enum(['chat', 'template']),
  /** The customer action this made, for the actions that have one. */
  actionId: idSchema.nullable(),
});
export type SendResult = z.infer<typeof sendResultSchema>;
