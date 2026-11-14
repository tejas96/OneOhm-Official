import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  cancelVisitSchema,
  setVisitSchema,
  visitListQuerySchema,
  visitListRowSchema,
  visitSchema,
  visitScopeSchema,
  visitsOfSchema,
} from '../schemas/visit.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const empty = z.object({}).optional();

/** Visits to the customer's home (redesign §8): read, set a day, confirm, cancel, mark done. */
export const visitsContract = c.router({
  listVisits: {
    method: 'GET',
    path: '/visits/list',
    query: visitListQuerySchema,
    responses: { 200: z.array(visitListRowSchema) },
    summary:
      'Every visit of the days asked (the visits page); people without a team view see their own.',
  },
  visitsOf: {
    method: 'GET',
    path: '/visits',
    query: visitScopeSchema,
    responses: { 200: visitsOfSchema },
    summary: 'The visits of a task, lead or service request, and the days the crew is free.',
  },
  setVisit: {
    method: 'POST',
    path: '/visits',
    body: setVisitSchema,
    responses: { 200: visitSchema },
    summary:
      'Confirms the customer pick, moves the open visit, or books a day with no pick; tells the customer.',
  },
  cancelVisit: {
    method: 'POST',
    path: '/visits/:id/cancel',
    pathParams: idParams,
    body: cancelVisitSchema,
    responses: { 200: visitSchema },
  },
  doneVisit: {
    method: 'POST',
    path: '/visits/:id/done',
    pathParams: idParams,
    body: empty,
    responses: { 200: visitSchema },
  },
});
