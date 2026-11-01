import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  feedbackEntrySchema,
  serviceAssigneeSchema,
  serviceTicketPatchSchema,
  serviceTicketQuerySchema,
  serviceTicketSchema,
  serviceVisitDaySchema,
} from '../schemas/service-desk.schema';

const c = initContract();

/** The office side of after-sales: customer service requests and ratings (PRD 3.17, 5.5). */
export const serviceDeskContract = c.router({
  listTickets: {
    method: 'GET',
    path: '/service-requests',
    query: serviceTicketQuerySchema,
    responses: { 200: z.array(serviceTicketSchema) },
    summary: 'Newest first; `sla` keeps requests due soon or past a promised time.',
  },
  listAssignees: {
    method: 'GET',
    path: '/service-requests/assignees',
    responses: { 200: z.array(serviceAssigneeSchema) },
    summary: 'People who can take service work, least busy first.',
  },
  updateTicket: {
    method: 'PATCH',
    path: '/service-requests/:id',
    pathParams: z.object({ id: idSchema }),
    body: serviceTicketPatchSchema,
    responses: { 200: serviceTicketSchema },
    summary: 'Assign, start or resolve; resolving tells the customer on WhatsApp.',
  },
  setTicketVisitDay: {
    method: 'PUT',
    path: '/service-requests/:id/visit-day',
    pathParams: z.object({ id: idSchema }),
    body: serviceVisitDaySchema,
    responses: { 200: serviceTicketSchema },
    summary: 'Books, moves or clears the technician visit; a new day tells the customer.',
  },
  listFeedback: {
    method: 'GET',
    path: '/feedback',
    responses: { 200: z.array(feedbackEntrySchema) },
  },
});
