import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../common/primitives';
import {
  dutyPointsBatchSchema,
  dutyPointsResultSchema,
  dutyRouteSchema,
} from '../schemas/duty-points.schema';

const c = initContract();
const dateQuery = z.object({ date: calendarDateSchema.optional() });

/** The route recorded while a person is on duty, and who may read it (Duty Day step 1). */
export const dutyPointsContract = c.router({
  uploadDutyPoints: {
    method: 'POST',
    path: '/me/duty-points',
    body: dutyPointsBatchSchema,
    responses: { 200: dutyPointsResultSchema },
    summary: 'Up to 200 route points from the phone; each is accepted or rejected with a reason.',
  },
  myDutyRoute: {
    method: 'GET',
    path: '/me/duty-route',
    query: dateQuery,
    responses: { 200: dutyRouteSchema },
    summary: 'The signed-in person’s own route for a day (today when no date is given).',
  },
  dutyRoute: {
    method: 'GET',
    path: '/people/:id/duty-route',
    pathParams: z.object({ id: idSchema }),
    query: dateQuery,
    responses: { 200: dutyRouteSchema },
    summary: 'A person’s route for a day: themself, their manager, HR or a team attendance viewer.',
  },
});
