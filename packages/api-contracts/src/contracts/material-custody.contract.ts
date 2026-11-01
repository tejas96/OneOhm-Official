import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  contractorMaterialSchema,
  crewUsageInputSchema,
  issueInputSchema,
  materialSlipSchema,
  projectCustodySchema,
  returnInputSchema,
  usageInputSchema,
} from '../schemas/material-custody.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * Material issued to contractors (PRD 3.10, 3.13, Flow H step 3): issue from the store,
 * usage, return to the store, and the per-project reconciliation against the quotation.
 */
export const custodyRouter = c.router({
  project: {
    method: 'GET',
    path: '/projects/:id/material/custody',
    pathParams: idParams,
    responses: { 200: projectCustodySchema },
    summary: 'Reconciliation per quotation line, what each contractor holds, and the slips.',
  },
  issue: {
    method: 'POST',
    path: '/projects/:id/material/issues',
    pathParams: idParams,
    body: issueInputSchema,
    responses: { 201: materialSlipSchema },
    summary: "Out of the store into the contractor's hands; uses the project's reservation first.",
  },
  recordUse: {
    method: 'POST',
    path: '/projects/:id/material/usage',
    pathParams: idParams,
    body: usageInputSchema,
    responses: { 201: materialSlipSchema },
    summary: 'What went into the system; never more than the contractor holds.',
  },
  recordReturn: {
    method: 'POST',
    path: '/projects/:id/material/returns',
    pathParams: idParams,
    body: returnInputSchema,
    responses: { 201: materialSlipSchema },
    summary: 'Unused material back in the store; serialised items name their serials.',
  },
  attachPhoto: {
    method: 'POST',
    path: '/material-slips/:id/photo',
    pathParams: idParams,
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: materialSlipSchema },
    summary: 'A photo of the material handed over, kept with the project documents.',
  },
  contractor: {
    method: 'GET',
    path: '/contractors/:id/material',
    pathParams: idParams,
    responses: { 200: contractorMaterialSchema },
  },
  crewMaterial: {
    method: 'GET',
    path: '/crew/material',
    responses: { 200: contractorMaterialSchema },
    summary: "The signed-in crew member's contractor: what it holds per project.",
  },
  crewUse: {
    method: 'POST',
    path: '/crew/material/usage',
    body: crewUsageInputSchema,
    responses: { 201: materialSlipSchema },
  },
});
