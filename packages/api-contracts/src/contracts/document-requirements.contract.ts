import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  documentRequirementInputSchema,
  documentRequirementSchema,
  documentRequirementUpdateSchema,
} from '../schemas/document-requirement.schema';

const c = initContract();

/** The papers projects need, edited in Settings → Required documents (PRD 3.14). */
export const documentRequirementsContract = c.router({
  listDocumentRequirements: {
    method: 'GET',
    path: '/document-requirements',
    responses: { 200: z.array(documentRequirementSchema) },
  },
  createDocumentRequirement: {
    method: 'POST',
    path: '/document-requirements',
    body: documentRequirementInputSchema,
    responses: { 201: z.array(documentRequirementSchema) },
  },
  updateDocumentRequirement: {
    method: 'PATCH',
    path: '/document-requirements/:key',
    pathParams: z.object({ key: z.string().min(1).max(60) }),
    body: documentRequirementUpdateSchema,
    responses: { 200: z.array(documentRequirementSchema) },
  },
});
