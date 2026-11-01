import { LEAD_SOURCES, LEAD_STAGES, SUBSIDY_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';

export const leadStageSchema = z.enum(LEAD_STAGES);
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export const subsidyCategorySchema = z.enum(SUBSIDY_CATEGORIES);

export const userRefSchema = z.object({ id: idSchema, fullName: z.string() });

export const leadSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  city: z.string(),
  source: leadSourceSchema,
  stage: leadStageSchema,
  /** The owner's pipeline step inside the stage (PRD 3.3); null once won or lost. */
  step: z.object({ key: z.string(), name: z.string() }).nullable(),
  subsidyCategory: subsidyCategorySchema,
  estimatedWp: z.number().int().nullable(),
  owner: userRefSchema.nullable(),
  nextActionOn: calendarDateSchema.nullable(),
  nextActionNote: z.string().nullable(),
  /** An open lead whose next action date has passed (PRD 3.3: never silent). */
  overdue: z.boolean(),
  customerId: idSchema.nullable(),
  propertyId: idSchema.nullable(),
  lostReason: z.string().nullable(),
  notes: z.string().nullable(),
  /** The customer who referred this lead, if any. */
  referredBy: z.object({ id: idSchema, name: z.string() }).nullable(),
  createdAt: instantSchema,
});
export type Lead = z.infer<typeof leadSchema>;

export const leadActivitySchema = z.object({
  id: idSchema,
  kind: z.enum(['note', 'call', 'visit', 'whatsapp', 'stage_change', 'follow_up']),
  note: z.string(),
  user: userRefSchema.nullable(),
  createdAt: instantSchema,
});

export const leadDetailSchema = leadSchema.extend({ activities: z.array(leadActivitySchema) });
export type LeadDetail = z.infer<typeof leadDetailSchema>;

export const propertySchema = z.object({
  id: idSchema,
  customerId: idSchema,
  label: z.string(),
  addressLine: z.string(),
  city: z.string(),
  district: z.string(),
  state: z.string(),
  pincode: z.string().nullable(),
  subsidyCategory: subsidyCategorySchema,
  households: z.number().int().nullable(),
  discomId: idSchema.nullable(),
  consumerNumber: z.string().nullable(),
  meterHolderName: z.string().nullable(),
  sanctionedLoadW: z.number().int().nullable(),
  phase: z.enum(['single', 'three']).nullable(),
  meterInSocietyName: z.boolean().nullable(),
  subsidyClaimed: z.boolean(),
  floors: z.number().int(),
});
export type Property = z.infer<typeof propertySchema>;

export const customerSchema = z.object({
  id: idSchema,
  kind: z.enum(['individual', 'organization']),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  createdAt: instantSchema,
  propertyCount: z.number().int(),
  projectCount: z.number().int(),
});
export type Customer = z.infer<typeof customerSchema>;
