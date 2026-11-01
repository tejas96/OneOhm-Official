import { CONTACT_CHANNELS } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

/** How OneOhm reaches one customer: WhatsApp first, then SMS, then in person. */
export const customerContactSchema = z.object({
  customerId: idSchema,
  phone: z.string(),
  channel: z.enum(CONTACT_CHANNELS),
  /** WhatsApp said the number is not on WhatsApp; messages go by SMS meanwhile. */
  whatsappUnreachableAt: z.string().nullable(),
  whatsappOptIn: z.boolean(),
  /** Where the next message will actually go. */
  route: z.enum(CONTACT_CHANNELS),
});
export type CustomerContact = z.infer<typeof customerContactSchema>;

export const customerContactUpdateSchema = z.object({
  channel: z.enum(CONTACT_CHANNELS).optional(),
  /** Clears "not on WhatsApp" so the next message tries WhatsApp again. */
  tryWhatsAppAgain: z.boolean().optional(),
});

/** News to share in person with a customer who has neither WhatsApp nor SMS. */
export const handoverSchema = z.object({
  id: idSchema,
  customerId: idSchema,
  customer: z.string(),
  phone: z.string(),
  projectId: idSchema.nullable(),
  projectCode: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  doneAt: z.string().nullable(),
  doneBy: z.string().nullable(),
  note: z.string().nullable(),
  /** The paper to print and hand over, when the news is about one (quotation, receipt). */
  printPath: z.string().nullable(),
});
export type Handover = z.infer<typeof handoverSchema>;
