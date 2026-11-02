import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema, phoneSchema } from '../common/primitives';
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
  open: {
    method: 'POST',
    path: '/whatsapp/chats/open',
    body: z.object({ phone: phoneSchema }),
    responses: { 200: chatSummarySchema },
    summary: 'The chat with a customer or lead, made when there is none yet.',
  },
  byPhone: {
    method: 'GET',
    path: '/whatsapp/chat-by-phone',
    // With a customer: their own number first, else their newest chat (a family member's).
    query: z.object({ phone: phoneSchema, customerId: idSchema.optional() }),
    // Wrapped: a bare null body does not survive the trip as JSON.
    responses: { 200: z.object({ detail: chatDetailSchema.nullable() }) },
    summary: 'The chat with a number, or null; looking never makes a chat.',
  },
  team: {
    method: 'GET',
    path: '/whatsapp/team',
    responses: { 200: z.array(z.object({ id: idSchema, name: z.string() })) },
    summary: 'Active staff a chat can be passed to.',
  },
  assign: {
    method: 'POST',
    path: '/whatsapp/chats/:id/assign',
    pathParams: idParams,
    body: z.object({ userId: idSchema }),
    responses: { 200: chatSummarySchema },
    summary: 'Pass the chat to another team member, who is told.',
  },
  reply: {
    method: 'POST',
    path: '/whatsapp/chats/:id/reply',
    pathParams: idParams,
    body: z.object({ text: z.string().trim().min(1, 'Write a reply.').max(4000) }),
    responses: { 201: chatDetailSchema },
    summary:
      'A team member answers; the assistant stays quiet until released. After 24 hours without a customer message, the words go inside the approved follow-up template.',
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
