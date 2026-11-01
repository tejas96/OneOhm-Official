import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { projectTaskSchema } from '../schemas/project.schema';
import {
  rescheduleTaskInputSchema,
  returnTaskInputSchema,
  taskActivitySchema,
  taskUpdateInputSchema,
} from '../schemas/task-flow.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * Moving a task along between start and finish (PRD 3.6, 4.4), part of the tasks contract:
 * a new due date, work sent back for correction, progress notes and the project history.
 */
export const taskFlowRoutes = c.router({
  rescheduleTask: {
    method: 'POST',
    path: '/tasks/:id/reschedule',
    pathParams: idParams,
    body: rescheduleTaskInputSchema,
    responses: { 200: projectTaskSchema },
    summary:
      'Managers move the due date with a reason; tasks waiting on it move later when needed.',
  },
  returnTask: {
    method: 'POST',
    path: '/tasks/:id/return',
    pathParams: idParams,
    body: returnTaskInputSchema,
    responses: { 200: projectTaskSchema },
    summary: 'The reviewer sends work in review back to the assignee with a reason.',
  },
  postTaskUpdate: {
    method: 'POST',
    path: '/tasks/:id/updates',
    pathParams: idParams,
    body: taskUpdateInputSchema,
    responses: { 200: projectTaskSchema },
    summary: 'A progress note on the project history; the status does not change.',
  },
  taskActivity: {
    method: 'GET',
    path: '/tasks/:id/activity',
    pathParams: idParams,
    responses: { 200: z.array(taskActivitySchema) },
    summary: 'The latest project history for a task screen; crews see their own tasks only.',
  },
});
