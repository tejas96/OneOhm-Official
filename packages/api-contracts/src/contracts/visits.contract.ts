import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  cancelVisitSchema,
  setVisitSchema,
  visitSchema,
  visitScopeSchema,
  visitsOfSchema,
} from '../schemas/visit.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const empty = z.object({}).optional();

/** Visits to the customer's home (redesign §8): read, set a day, confirm, cancel, mark done. */
export const visitsContract = c.router({
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
