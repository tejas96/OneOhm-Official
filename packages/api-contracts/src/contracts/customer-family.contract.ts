import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { familyMemberSchema, newFamilyMemberSchema } from '../schemas/customer-family.schema';

const c = initContract();

/** Family access (PRD 5.1): only the customer, not a family member, can change it. */
export const customerFamilyContract = c.router({
  listFamily: {
    method: 'GET',
    path: '/customer/family',
    responses: { 200: z.array(familyMemberSchema) },
  },
  addFamily: {
    method: 'POST',
    path: '/customer/family',
    body: newFamilyMemberSchema,
    responses: { 201: z.array(familyMemberSchema) },
  },
  removeFamily: {
    method: 'DELETE',
    path: '/customer/family/:id',
    pathParams: z.object({ id: idSchema }),
    body: z.object({}).optional(),
    responses: { 200: z.array(familyMemberSchema) },
  },
});
