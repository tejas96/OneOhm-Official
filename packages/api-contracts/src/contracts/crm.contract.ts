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
  customerSchema,
  leadDetailSchema,
  leadSchema,
  leadSourceSchema,
  leadStageSchema,
  propertySchema,
  subsidyCategorySchema,
} from '../schemas/crm.schema';
import { customerActivitySchema } from '../schemas/customer-activity.schema';
import { projectSummarySchema } from '../schemas/project.schema';
import { quotationSummarySchema } from '../schemas/quotation.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

export const propertyInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  addressLine: z.string().trim().min(3, 'Enter the site address.').max(400),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80).default('Maharashtra'),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Use a 6-digit PIN code.')
    .nullable()
    .optional(),
  subsidyCategory: subsidyCategorySchema,
  households: z.number().int().positive().nullable().optional(),
  discomId: idSchema.nullable().optional(),
  consumerNumber: z.string().trim().max(40).nullable().optional(),
  meterHolderName: z.string().trim().max(160).nullable().optional(),
  sanctionedLoadW: z.number().int().positive().nullable().optional(),
  phase: z.enum(['single', 'three']).nullable().optional(),
  meterInSocietyName: z.boolean().nullable().optional(),
  floors: z.number().int().min(0).max(40).default(1),
});
export type PropertyInput = z.infer<typeof propertyInputSchema>;

export const crmContract = c.router({
  listLeads: {
    method: 'GET',
    path: '/leads',
    query: z.object({
      stage: leadStageSchema.optional(),
      search: z.string().trim().max(80).optional(),
      open: z
        .union([z.boolean(), z.enum(['true', 'false'])])
        .transform((value) => value === true || value === 'true')
        .optional(),
    }),
    responses: { 200: z.array(leadSchema) },
  },
  createLead: {
    method: 'POST',
    path: '/leads',
    body: z.object({
      name: nameSchema,
      phone: phoneSchema,
      email: emailSchema.nullable().optional(),
      city: z.string().trim().min(2).max(80),
      source: leadSourceSchema.default('manual'),
      subsidyCategory: subsidyCategorySchema.default('individual'),
      estimatedWp: z.number().int().positive().nullable().optional(),
      ownerUserId: idSchema.nullable().optional(),
      nextActionOn: calendarDateSchema,
      nextActionNote: z.string().trim().max(300).nullable().optional(),
      notes: noteSchema.nullable().optional(),
      /** A customer's referral code: the lead remembers who referred it (PRD 5.6). */
      referralCode: z.string().trim().max(16).nullable().optional(),
    }),
    responses: { 201: leadSchema },
    summary: 'Duplicate detection: an open lead with the same phone answers 409 with its id.',
  },
  getLead: {
    method: 'GET',
    path: '/leads/:id',
    pathParams: idParams,
    responses: { 200: leadDetailSchema },
  },
  updateLead: {
    method: 'PATCH',
    path: '/leads/:id',
    pathParams: idParams,
    body: z.object({
      stage: leadStageSchema.optional(),
      /** Moves the lead to this pipeline step (and its stage). */
      stepKey: z.string().trim().min(1).max(60).optional(),
      ownerUserId: idSchema.nullable().optional(),
      nextActionOn: calendarDateSchema.nullable().optional(),
      nextActionNote: z.string().trim().max(300).nullable().optional(),
      lostReason: z.string().trim().max(300).nullable().optional(),
      estimatedWp: z.number().int().positive().nullable().optional(),
    }),
    responses: { 200: leadDetailSchema },
  },
  addLeadActivity: {
    method: 'POST',
    path: '/leads/:id/activities',
    pathParams: idParams,
    body: z.object({
      kind: z.enum(['note', 'call', 'visit', 'whatsapp']),
      note: noteSchema.min(1),
    }),
    responses: { 201: leadDetailSchema },
  },
  convertLead: {
    method: 'POST',
    path: '/leads/:id/customer',
    pathParams: idParams,
    body: z.object({
      kind: z.enum(['individual', 'organization']).default('individual'),
      property: propertyInputSchema,
    }),
    responses: { 201: z.object({ customerId: idSchema, propertyId: idSchema }) },
    summary: 'Creates (or matches by phone) the customer and their property for a lead.',
  },
  listCustomers: {
    method: 'GET',
    path: '/customers',
    query: z.object({ search: z.string().trim().max(80).optional() }),
    responses: { 200: z.array(customerSchema) },
  },
  getCustomer: {
    method: 'GET',
    path: '/customers/:id',
    pathParams: idParams,
    responses: {
      200: customerSchema.extend({
        properties: z.array(propertySchema),
        quotations: z.array(quotationSummarySchema),
        projects: z.array(projectSummarySchema),
      }),
    },
  },
  getCustomerActivity: {
    method: 'GET',
    path: '/customers/:id/activity',
    pathParams: idParams,
    responses: { 200: customerActivitySchema },
    summary:
      'The rest of the customer 360: money per project, chat and messages, change requests, service, feedback and referrals.',
  },
  getProperty: {
    method: 'GET',
    path: '/properties/:id',
    pathParams: idParams,
    responses: { 200: propertySchema.extend({ customer: customerSchema }) },
    summary: 'One property with its customer (the quotation builder starts from a property).',
  },
  updateProperty: {
    method: 'PATCH',
    path: '/properties/:id',
    pathParams: idParams,
    body: propertyInputSchema.partial(),
    responses: { 200: propertySchema },
  },
});
