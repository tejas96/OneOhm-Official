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
      phone: phoneSchema,
      employeeCode: z.string().trim().max(40).nullable().optional(),
      designation: z.string().trim().max(120).nullable().optional(),
      roleIds: z.array(idSchema).min(1, 'Choose at least one role.'),
    }),
    responses: { 201: personSchema },
  },
  updatePerson: {
    method: 'PATCH',
    path: '/people/:id',
    pathParams: idParams,
    body: z.object({
      fullName: nameSchema.optional(),
      email: emailSchema.nullable().optional(),
      phone: phoneSchema.nullable().optional(),
      employeeCode: z.string().trim().max(40).nullable().optional(),
      /** Clears the web password, signs them out everywhere and sends the invite again. */
      requireNewPassword: z.literal(true).optional(),
      roleIds: z.array(idSchema).min(1, 'Choose at least one role.').optional(),
      status: z.enum(['active', 'inactive']).optional(),
      onLeave: z.boolean().optional(),
      designation: z.string().trim().max(120).nullable().optional(),
      skills: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
      /** Own open-task limit; null goes back to the company default. */
      openTaskLimit: z.number().int().min(1).max(500).nullable().optional(),
      /** Location on or off for this person; null follows their roles and the company. */
      tracking: z.enum(['on', 'off']).nullable().optional(),
      /** Who the person reports to; null for no one. */
      reportsToUserId: idSchema.nullable().optional(),
    }),
    responses: { 200: personSchema },
  },
  invitePerson: {
    method: 'POST',
    path: '/people/:id/invite',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 202: personSchema },
  },
  releasePhone: {
    method: 'POST',
    path: '/people/:id/release-phone',
    pathParams: idParams,
    body: c.noBody(),
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
