import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';

export const DELIVERY_STATES = [
  'pending',
  'skipped',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;

/** One WhatsApp chat in the staff inbox (PRD 6.1). */
export const chatSummarySchema = z.object({
  id: idSchema,
  phone: z.string(),
  name: z.string(),
  customerId: idSchema.nullable(),
  /** `human` while a team member has taken over from the assistant. */
  state: z.string(),
  handedOverAt: instantSchema.nullable(),
  /** The team member who last answered by hand. */
  handledByUserId: idSchema.nullable(),
  /** Who answers this chat (project manager or lead owner); null is the service team. */
  assignee: z.object({ id: idSchema, name: z.string() }).nullable(),
  /** A person has the chat and the customer wrote last: an answer is owed. */
  needsReply: z.boolean(),
  /** Needs a reply and has waited over 2 working hours. */
  late: z.boolean(),
  lastMessage: z
    .object({ body: z.string(), direction: z.enum(['in', 'out']), at: instantSchema })
    .nullable(),
  lastInboundAt: instantSchema.nullable(),
  /** WhatsApp allows free replies for 24 hours after the customer's last message. */
  windowOpen: z.boolean(),
  /** The person sent STOP: no templates or nudges until they send START. */
  optedOut: z.boolean(),
});
export type ChatSummary = z.infer<typeof chatSummarySchema>;

/** A photo, paper, video or voice note in a chat message, kept under Documents. */
export const chatFileSchema = z.object({
  id: idSchema,
  name: z.string(),
  contentType: z.string(),
  /** Where it was filed ("Electricity bill · Pune"); null while it is still to sort. */
  filedAs: z.string().nullable(),
});
export type ChatFile = z.infer<typeof chatFileSchema>;

export const chatMessageSchema = z.object({
  id: idSchema,
  direction: z.enum(['in', 'out']),
  kind: z.string(),
  body: z.string(),
  at: instantSchema,
  delivery: z.enum(DELIVERY_STATES).nullable(),
  sentBy: z.string().nullable(),
  file: chatFileSchema.nullable(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatDetailSchema = z.object({
  chat: chatSummarySchema,
  messages: z.array(chatMessageSchema),
});
export type ChatDetail = z.infer<typeof chatDetailSchema>;

/** One business message and how far it got (PRD 6.2: delivery tracking and retries). */
export const deliverySchema = z.object({
  id: idSchema,
  channel: z.enum(['whatsapp', 'sms', 'push']),
  recipient: z.string(),
  template: z.string(),
  state: z.enum(DELIVERY_STATES),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: instantSchema,
  sentAt: instantSchema.nullable(),
  deliveredAt: instantSchema.nullable(),
  readAt: instantSchema.nullable(),
});
export type Delivery = z.infer<typeof deliverySchema>;

/** A WhatsApp form we can send and whether it is published (its flow id is saved). */
export const whatsappFormSchema = z.object({
  key: z.string(),
  name: z.string(),
  version: z.string(),
  /** The flow id from WhatsApp Manager; null while the form is not published. */
  flowId: z.string().nullable(),
});
export type WhatsappForm = z.infer<typeof whatsappFormSchema>;

/** The flow id to save for a form; empty takes the form out of use. */
export const saveWhatsappFormSchema = z.object({
  flowId: z.string().trim().max(40).regex(/^\d*$/, 'Use the numbers from WhatsApp Manager.'),
});
