import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  feedbackEntrySchema,
  SERVICE_STATUSES,
  serviceTicketPatchSchema,
  serviceTicketSchema,
} from '../schemas/service-desk.schema';

const c = initContract();

/** The office side of after-sales: customer service requests and ratings (PRD 3.17, 5.5). */
export const serviceDeskContract = c.router({
  listTickets: {
    method: 'GET',
    path: '/service-requests',
    query: z.object({ status: z.enum(SERVICE_STATUSES).optional() }),
    responses: { 200: z.array(serviceTicketSchema) },
  },
  updateTicket: {
    method: 'PATCH',
    path: '/service-requests/:id',
    pathParams: z.object({ id: idSchema }),
    body: serviceTicketPatchSchema,
    responses: { 200: serviceTicketSchema },
    summary: 'Assign, start or resolve; resolving tells the customer on WhatsApp.',
  },
  listFeedback: {
    method: 'GET',
    path: '/feedback',
    responses: { 200: z.array(feedbackEntrySchema) },
  },
});
