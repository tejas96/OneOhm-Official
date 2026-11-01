import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  stateSubsidyInputSchema,
  stateSubsidyVersionSchema,
} from '../schemas/state-support.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * The state's low-income top-up (PRD 3.5): its rule versions in Settings → Subsidy, and
 * the low-income flag on a property that makes a home eligible.
 */
export const stateSupportContract = c.router({
  listStateRules: {
    method: 'GET',
    path: '/settings/state-subsidy-rules',
    responses: { 200: z.array(stateSubsidyVersionSchema) },
  },
  createStateRule: {
    method: 'POST',
    path: '/settings/state-subsidy-rules',
    body: stateSubsidyInputSchema,
    responses: { 201: stateSubsidyVersionSchema },
    summary: 'A new version from a start date (today or later); earlier versions stay.',
  },
  updateStateRule: {
    method: 'PUT',
    path: '/settings/state-subsidy-rules/:id',
    pathParams: idParams,
    body: stateSubsidyInputSchema,
    responses: { 200: stateSubsidyVersionSchema },
    summary: 'Only a version that is not yet in force can change.',
  },
  deleteStateRule: {
    method: 'DELETE',
    path: '/settings/state-subsidy-rules/:id',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 204: c.noBody() },
    summary: 'Withdraws a version that is not yet in force.',
  },
  setLowIncome: {
    method: 'PUT',
    path: '/properties/:id/low-income',
    pathParams: idParams,
    body: z.object({ lowIncome: z.boolean() }),
    responses: { 200: z.object({ lowIncomeHousehold: z.boolean() }) },
    summary:
      'Marks a home as a low-income household for the state top-up (proof filed as Income proof), or clears it.',
  },
});
