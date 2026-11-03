import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  calendarDateSchema,
  consumerNumberSchema,
  emailSchema,
  idSchema,
  nameSchema,
  noteSchema,
  phoneSchema,
} from '../common/primitives';
import { gstinSchema } from '../schemas/billing.schema';
import {
  customerAccountSchema,
  customerSchema,
  leadDetailSchema,
  leadLostReasonSchema,
  leadSchema,
  leadSourceSchema,
  leadStageSchema,
  propertySchema,
  subsidyCategorySchema,
  timeOfDaySchema,
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
  /** Unique: no two sites share a consumer number. */
  consumerNumber: consumerNumberSchema.nullable().optional(),
  meterHolderName: z.string().trim().max(160).nullable().optional(),
  sanctionedLoadW: z.number().int().positive().nullable().optional(),
  phase: z.enum(['single', 'three']).nullable().optional(),
  meterInSocietyName: z.boolean().nullable().optional(),
  floors: z.number().int().min(0).max(40).default(1),
  /** GPS of the site; staff correct it when the survey pin was off. */
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  /** How a changed point was set on the web; typed numbers when left out. */
  locationSource: z.enum(['map_pin', 'typed']).optional(),
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
      /** Only open leads that have no owner (managers fix these). */
      unowned: z
        .union([z.boolean(), z.enum(['true', 'false'])])
        .transform((value) => value === true || value === 'true')
        .optional(),
    }),
    responses: { 200: z.array(leadSchema) },
    summary: '`open` also brings lost leads whose revisit day has come (`revisitDue`).',
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
      nextActionTime: timeOfDaySchema.nullable().optional(),
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
      /** Left out with a new date: the time is cleared. */
      nextActionTime: timeOfDaySchema.nullable().optional(),
      nextActionNote: z.string().trim().max(300).nullable().optional(),
      lostReasonKey: leadLostReasonSchema.nullable().optional(),
      lostReason: z.string().trim().max(300).nullable().optional(),
      /** With a lost lead: the day to try again. */
      revisitOn: calendarDateSchema.nullable().optional(),
      estimatedWp: z.number().int().positive().nullable().optional(),
    }),
    responses: { 200: leadDetailSchema },
    summary: 'An open lead always keeps an owner; moving a lost lead to a stage reopens it.',
  },
  addLeadActivity: {
    method: 'POST',
    path: '/leads/:id/activities',
    pathParams: idParams,
    body: z.object({
      kind: z.enum(['note', 'call', 'visit', 'whatsapp']),
      note: noteSchema.min(1),
      /** Staff only: kept from the reseller who brought the lead. */
      internal: z.boolean().optional(),
    }),
    responses: { 201: leadDetailSchema },
  },
  convertLead: {
    method: 'POST',
    path: '/leads/:id/customer',
    pathParams: idParams,
    body: z
      .object({
        kind: z.enum(['individual', 'organization']).default('individual'),
        /** A new site, or … */
        property: propertyInputSchema.optional(),
        /** … a site the matched customer already has. */
        propertyId: idSchema.optional(),
      })
      .refine((body) => Boolean(body.property) !== Boolean(body.propertyId), {
        message: 'Add the site, or pick one the customer already has.',
        path: ['property'],
      }),
    responses: { 201: z.object({ customerId: idSchema, propertyId: idSchema }) },
    summary: 'Creates (or matches by phone) the customer, and adds or reuses their property.',
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
        accounts: z.array(customerAccountSchema),
      }),
    },
  },
  updateCustomer: {
    method: 'PATCH',
    path: '/customers/:id',
    pathParams: idParams,
    body: z.object({
      name: nameSchema.optional(),
      /** Unique: no two customers share a number. */
      phone: phoneSchema.optional(),
      email: emailSchema.nullable().optional(),
      kind: z.enum(['individual', 'organization']).optional(),
      gstin: gstinSchema.nullable().optional(),
    }),
    responses: { 200: customerSchema },
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
  addProperty: {
    method: 'POST',
    path: '/customers/:id/properties',
    pathParams: idParams,
    body: propertyInputSchema,
    responses: { 201: propertySchema },
    summary: 'Adds another site to a customer (a second home, a shop or a farm).',
  },
  updateProperty: {
    method: 'PATCH',
    path: '/properties/:id',
    pathParams: idParams,
    body: propertyInputSchema.partial(),
    responses: { 200: propertySchema },
  },
  confirmSiteLocation: {
    method: 'POST',
    path: '/properties/:id/location/confirm',
    pathParams: idParams,
    body: z.object({}).optional(),
    responses: { 200: propertySchema },
    summary: 'The office keeps a flagged site pin as it is.',
  },
  restoreSiteLocation: {
    method: 'POST',
    path: '/properties/:id/location/restore',
    pathParams: idParams,
    body: z.object({}).optional(),
    responses: { 200: propertySchema },
    summary: 'Puts back the earlier site point (the current one becomes the earlier one).',
  },
});
