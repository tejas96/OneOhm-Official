import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  calendarDateSchema,
  emailSchema,
  idSchema,
  nameSchema,
  noteSchema,
  phoneSchema,
} from '../common/primitives';
import {
  contractorDetailSchema,
  contractorRateSchema,
  contractorSummarySchema,
  crewCandidateSchema,
  rateBasisSchema,
  workOrderDetailSchema,
  workOrderStatusSchema,
  workOrderSummarySchema,
} from '../schemas/contractor.schema';
import { projectTypeSchema } from '../schemas/project.schema';
import { crewRoutes } from './crew.routes';

const c = initContract();
const pdfResponse = c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() });
const idParams = z.object({ id: idSchema });
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const basisPoints = z.number().int().min(0).max(5000);
const amount = z.number().int().positive('Enter an amount above zero.');

export const contractorInputSchema = z.object({
  name: nameSchema,
  kind: z.enum(['company', 'individual']).default('company'),
  contactName: optionalText(160),
  phone: phoneSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid 15-character GSTIN.')
    .nullable()
    .optional(),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN.')
    .nullable()
    .optional(),
  address: optionalText(400),
  bankAccountName: optionalText(160),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, 'Use digits only.')
    .nullable()
    .optional(),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z\d]{6}$/, 'Enter a valid IFSC.')
    .nullable()
    .optional(),
  paymentTermsDays: z.number().int().min(0).max(180).default(15),
  tdsBp: basisPoints.default(100),
  retentionBp: basisPoints.default(0),
  retentionDays: z.number().int().min(0).max(730).default(90),
  skills: z.array(z.string().trim().min(1)).min(1, 'Pick at least one kind of work.'),
  serviceAreas: z.array(z.string().trim().min(1).max(80)).default([]),
  notes: noteSchema.nullable().optional(),
});
export type ContractorInput = z.infer<typeof contractorInputSchema>;

export const contractorsContract = c.router({
  ...crewRoutes,
  listContractors: {
    method: 'GET',
    path: '/contractors',
    query: z.object({ search: z.string().trim().max(80).optional() }),
    responses: { 200: z.array(contractorSummarySchema) },
  },
  createContractor: {
    method: 'POST',
    path: '/contractors',
    body: contractorInputSchema,
    responses: { 201: contractorDetailSchema },
  },
  getContractor: {
    method: 'GET',
    path: '/contractors/:id',
    pathParams: idParams,
    responses: { 200: contractorDetailSchema },
  },
  updateContractor: {
    method: 'PATCH',
    path: '/contractors/:id',
    pathParams: idParams,
    body: contractorInputSchema.partial().extend({ active: z.boolean().optional() }),
    responses: { 200: contractorDetailSchema },
  },
  crewCandidates: {
    method: 'GET',
    path: '/crew-candidates',
    responses: { 200: z.array(crewCandidateSchema) },
    summary: 'Active people with a partner-kind role, and the contractor they belong to.',
  },
  setContractorMembers: {
    method: 'PUT',
    path: '/contractors/:id/members',
    pathParams: idParams,
    body: z.object({
      members: z.array(z.object({ userId: idSchema, lead: z.boolean().default(false) })),
    }),
    responses: { 200: contractorDetailSchema },
  },
  addContractorRate: {
    method: 'POST',
    path: '/contractors/:id/rates',
    pathParams: idParams,
    body: z.object({
      basis: rateBasisSchema,
      taskKey: z.string().trim().min(1).nullable().optional(),
      projectType: projectTypeSchema.nullable().optional(),
      label: z.string().trim().min(2).max(120),
      amountPaise: amount,
    }),
    responses: { 201: contractorRateSchema },
  },
  updateContractorRate: {
    method: 'PATCH',
    path: '/contractor-rates/:id',
    pathParams: idParams,
    body: z.object({
      label: z.string().trim().min(2).max(120).optional(),
      amountPaise: amount.optional(),
      active: z.boolean().optional(),
    }),
    responses: { 200: contractorRateSchema },
  },
  issueWorkOrder: {
    method: 'POST',
    path: '/contractors/:id/work-orders',
    pathParams: idParams,
    body: z.object({
      projectId: idSchema,
      dueDate: calendarDateSchema.nullable().optional(),
      scope: noteSchema.nullable().optional(),
    }),
    responses: { 201: workOrderDetailSchema },
    summary: "Hands the project's open tasks in the contractor's skills to its crew lead.",
  },
  listWorkOrders: {
    method: 'GET',
    path: '/work-orders',
    query: z.object({
      status: workOrderStatusSchema.optional(),
      contractorId: idSchema.optional(),
      projectId: idSchema.optional(),
    }),
    responses: { 200: z.array(workOrderSummarySchema) },
  },
  getWorkOrder: {
    method: 'GET',
    path: '/work-orders/:id',
    pathParams: idParams,
    responses: { 200: workOrderDetailSchema },
  },
  workOrderPdf: {
    method: 'GET',
    path: '/work-orders/:id/pdf',
    pathParams: idParams,
    query: z.object({ disposition: z.enum(['inline', 'attachment']).default('inline') }),
    responses: { 200: pdfResponse },
    summary:
      'The work order to hand to the crew: site, tasks and agreed rates. No project pricing.',
  },
  addWorkOrderLine: {
    method: 'POST',
    path: '/work-orders/:id/lines',
    pathParams: idParams,
    body: z.object({
      description: z.string().trim().min(2).max(200),
      quantityMilli: z.number().int().positive(),
      unitRatePaise: amount,
    }),
    responses: { 201: workOrderDetailSchema },
  },
  recordRework: {
    method: 'POST',
    path: '/work-orders/:id/rework',
    pathParams: idParams,
    body: z.object({
      taskId: idSchema.nullable().optional(),
      note: z.string().trim().min(3, 'Say what had to be redone.').max(2000),
      deductionPaise: z.number().int().min(0).default(0),
    }),
    responses: { 201: workOrderDetailSchema },
  },
  recordAdvance: {
    method: 'POST',
    path: '/work-orders/:id/advances',
    pathParams: idParams,
    body: z.object({ amountPaise: amount, note: noteSchema.nullable().optional() }),
    responses: { 201: workOrderDetailSchema },
  },
  cancelWorkOrder: {
    method: 'POST',
    path: '/work-orders/:id/cancel',
    pathParams: idParams,
    body: z.object({ reason: z.string().trim().min(3).max(500) }),
    responses: { 200: workOrderDetailSchema },
  },
});
