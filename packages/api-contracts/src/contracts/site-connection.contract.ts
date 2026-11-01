import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  leadConnectionInputSchema,
  siteConnectionSchema,
  taskConnectionInputSchema,
} from '../schemas/site-connection.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * The consumer number and DISCOM of a site, from the field (PRD 4.2 "Electricity bill,
 * consumer number and DISCOM capture"): on a lead's site, and on the task that verifies
 * the electricity details. Resellers reach only their own leads.
 */
export const siteConnectionContract = c.router({
  leadConnection: {
    method: 'GET',
    path: '/leads/:id/connection',
    pathParams: idParams,
    responses: { 200: siteConnectionSchema },
    summary: '404 when the lead has no site yet.',
  },
  updateLeadConnection: {
    method: 'PATCH',
    path: '/leads/:id/connection',
    pathParams: idParams,
    body: leadConnectionInputSchema,
    responses: { 200: siteConnectionSchema },
  },
  taskConnection: {
    method: 'GET',
    path: '/tasks/:id/connection',
    pathParams: idParams,
    responses: { 200: siteConnectionSchema },
  },
  updateTaskConnection: {
    method: 'PATCH',
    path: '/tasks/:id/connection',
    pathParams: idParams,
    body: taskConnectionInputSchema,
    responses: { 200: siteConnectionSchema },
    summary: 'Saves the DISCOM on the site and the project. The assignee or a manager.',
  },
});
