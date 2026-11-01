import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  chatDetailSchema,
  chatSummarySchema,
  DELIVERY_STATES,
  deliverySchema,
} from '../schemas/whatsapp.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** The WhatsApp inbox for staff and the log of every business message sent. */
export const whatsappContract = c.router({
  chats: {
    method: 'GET',
    path: '/whatsapp/chats',
    responses: { 200: z.array(chatSummarySchema) },
  },
  chat: {
    method: 'GET',
    path: '/whatsapp/chats/:id',
    pathParams: idParams,
    responses: { 200: chatDetailSchema },
  },
  reply: {
    method: 'POST',
    path: '/whatsapp/chats/:id/reply',
    pathParams: idParams,
    body: z.object({ text: z.string().trim().min(1, 'Write a reply.').max(4000) }),
    responses: { 201: chatDetailSchema },
    summary: 'A team member answers; the assistant stays quiet in this chat until released.',
  },
  release: {
    method: 'POST',
    path: '/whatsapp/chats/:id/release',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: chatDetailSchema },
  },
  deliveries: {
    method: 'GET',
    path: '/messages/deliveries',
    query: z.object({ state: z.enum(DELIVERY_STATES).optional() }),
    responses: { 200: z.array(deliverySchema) },
  },
  retryDelivery: {
    method: 'POST',
    path: '/messages/deliveries/:id/retry',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: deliverySchema },
  },
});
