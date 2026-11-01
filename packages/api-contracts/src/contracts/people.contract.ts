import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { emailSchema, idSchema, nameSchema, phoneSchema } from '../common/primitives';
import {
  capabilitySchema,
  personSchema,
  roleKindSchema,
  roleSchema,
} from '../schemas/identity.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

export const peopleContract = c.router({
  listPeople: { method: 'GET', path: '/people', responses: { 200: z.array(personSchema) } },
  createPerson: {
    method: 'POST',
    path: '/people',
    body: z.object({
      fullName: nameSchema,
      email: emailSchema.nullable().optional(),
      phone: phoneSchema.nullable().optional(),
      employeeCode: z.string().trim().max(40).nullable().optional(),
      designation: z.string().trim().max(120).nullable().optional(),
      password: z.string().min(8, 'Use at least 8 characters.').nullable().optional(),
      roleIds: z.array(idSchema).min(1, 'Choose at least one role.'),
    }),
    responses: { 201: personSchema },
  },
  updatePerson: {
    method: 'PATCH',
    path: '/people/:id',
    pathParams: idParams,
    body: z.object({
      roleIds: z.array(idSchema).min(1).optional(),
      status: z.enum(['active', 'inactive']).optional(),
      onLeave: z.boolean().optional(),
      designation: z.string().trim().max(120).nullable().optional(),
    }),
    responses: { 200: personSchema },
  },
  listRoles: { method: 'GET', path: '/roles', responses: { 200: z.array(roleSchema) } },
  createRole: {
    method: 'POST',
    path: '/roles',
    body: z.object({
      name: nameSchema,
      kind: roleKindSchema,
      description: z.string().trim().max(400).default(''),
      capabilities: z.array(capabilitySchema),
    }),
    responses: { 201: roleSchema },
  },
  updateRole: {
    method: 'PATCH',
    path: '/roles/:id',
    pathParams: idParams,
    body: z.object({
      name: nameSchema.optional(),
      description: z.string().trim().max(400).optional(),
      capabilities: z.array(capabilitySchema).optional(),
      archived: z.boolean().optional(),
    }),
    responses: { 200: roleSchema },
  },
  listCapabilities: {
    method: 'GET',
    path: '/capabilities',
    responses: { 200: z.array(capabilitySchema) },
  },
});
