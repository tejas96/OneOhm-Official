import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  projectChangeImpactSchema,
  projectChangeInputSchema,
  projectChangeSchema,
} from '../schemas/project-change.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * Scope and product changes on a live project (PRD 3.6, 3.15): raised in one step with
 * its impact, approved by a project manager, confirmed by the customer through the next
 * revision of the accepted quotation.
 */
export const projectChangesContract = c.router({
  listProjectChanges: {
    method: 'GET',
    path: '/projects/:id/changes',
    pathParams: idParams,
    responses: { 200: z.array(projectChangeSchema) },
    summary: 'Open and past changes on the project, newest first.',
  },
  previewProjectChange: {
    method: 'POST',
    path: '/projects/:id/changes/preview',
    pathParams: idParams,
    body: projectChangeInputSchema,
    responses: { 200: projectChangeImpactSchema },
    summary: 'The price, subsidy, timeline and material impact. Nothing is saved.',
  },
  raiseProjectChange: {
    method: 'POST',
    path: '/projects/:id/changes',
    pathParams: idParams,
    body: projectChangeInputSchema,
    responses: { 201: projectChangeSchema },
  },
  approveProjectChange: {
    method: 'POST',
    path: '/project-changes/:id/approve',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: projectChangeSchema },
    summary:
      'A project manager agrees: the next revision of the accepted quotation is drafted for the customer.',
  },
  withdrawProjectChange: {
    method: 'POST',
    path: '/project-changes/:id/withdraw',
    pathParams: idParams,
    body: z.object({ reason: z.string().trim().min(3).max(300) }),
    responses: { 200: projectChangeSchema },
    summary: 'Drops an open change; the project stays as it is.',
  },
  quotationProjectChange: {
    method: 'GET',
    path: '/quotations/:id/project-change',
    pathParams: idParams,
    responses: { 200: z.object({ change: projectChangeSchema.nullable() }) },
    summary: 'The project change a quotation revision carries, if any.',
  },
});
