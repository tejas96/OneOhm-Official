import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  leadStepInputSchema,
  leadStepSchema,
  leadStepUpdateSchema,
} from '../schemas/lead-step.schema';

const c = initContract();

/** The owner's sales pipeline steps (PRD 3.3, 7.4). */
export const leadStepsContract = c.router({
  listLeadSteps: {
    method: 'GET',
    path: '/lead-steps',
    responses: { 200: z.array(leadStepSchema) },
  },
  createLeadStep: {
    method: 'POST',
    path: '/lead-steps',
    body: leadStepInputSchema,
    responses: { 201: z.array(leadStepSchema) },
  },
  updateLeadStep: {
    method: 'PATCH',
    path: '/lead-steps/:key',
    pathParams: z.object({ key: z.string().min(1).max(60) }),
    body: leadStepUpdateSchema,
    responses: { 200: z.array(leadStepSchema) },
  },
});
