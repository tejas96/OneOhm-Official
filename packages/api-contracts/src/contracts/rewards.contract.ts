import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  decisionStatusSchema,
  pointsEntrySchema,
  pointsStandingSchema,
  workforcePolicySchema,
  workLocationInputSchema,
  workLocationSchema,
} from '../schemas/workforce.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const settingsBody = z.object({
  policy: workforcePolicySchema,
  locations: z.array(workLocationSchema),
});

/** Points and recognition (PRD 4.7, Flow G), and the workforce rules (PRD 7.2). */
export const rewardsContract = c.router({
  standings: {
    method: 'GET',
    path: '/points/standings',
    responses: { 200: z.array(pointsStandingSchema) },
  },
  listPoints: {
    method: 'GET',
    path: '/points',
    query: z.object({ status: decisionStatusSchema.optional() }),
    responses: { 200: z.array(pointsEntrySchema) },
  },
  givePoints: {
    method: 'POST',
    path: '/points',
    body: z.object({
      userId: idSchema,
      points: z.number().int().min(1),
      reason: z.string().trim().min(3, 'Say what it is for.').max(300),
    }),
    responses: { 201: pointsEntrySchema },
  },
  decidePoints: {
    method: 'POST',
    path: '/points/:id/decide',
    pathParams: idParams,
    body: z.object({ approve: z.boolean() }),
    responses: { 200: pointsEntrySchema },
  },
  workforceSettings: {
    method: 'GET',
    path: '/settings/workforce',
    responses: { 200: settingsBody },
  },
  saveWorkforcePolicy: {
    method: 'PUT',
    path: '/settings/workforce',
    body: workforcePolicySchema,
    responses: { 200: settingsBody },
  },
  addWorkLocation: {
    method: 'POST',
    path: '/settings/work-locations',
    body: workLocationInputSchema,
    responses: { 201: settingsBody },
  },
  updateWorkLocation: {
    method: 'PATCH',
    path: '/settings/work-locations/:id',
    pathParams: idParams,
    body: workLocationInputSchema.partial(),
    responses: { 200: settingsBody },
  },
});
