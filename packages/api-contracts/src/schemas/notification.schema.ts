import { z } from 'zod';
import { idSchema } from '../common/primitives';

export const NOTICE_SUBJECTS = [
  'task',
  'project',
  'leave',
  'correction',
  'points',
  'payment',
  'service_request',
  'quotation',
  'purchase_request',
  'vendor_advance',
  'stock',
  'travel_claim',
  'lead',
  /** Something waiting for approval too long; opens "Waiting for my approval". */
  'approval',
] as const;

/** One alert in a person's inbox, with what it is about so the app can open it. */
export const notificationSchema = z.object({
  id: idSchema,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  subject: z
    .object({
      type: z.enum(NOTICE_SUBJECTS),
      id: idSchema,
      projectId: idSchema.nullable(),
    })
    .nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;

export const inboxSchema = z.object({
  unread: z.number().int(),
  items: z.array(notificationSchema),
});
export type Inbox = z.infer<typeof inboxSchema>;

export const markReadSchema = z.object({
  /** Leave out to mark every alert as read. */
  ids: z.array(idSchema).max(200).optional(),
});

/** A phone's push token from the Expo notifications library. */
export const pushDeviceSchema = z.object({
  token: z.string().trim().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web']),
});
export type PushDeviceInput = z.infer<typeof pushDeviceSchema>;
