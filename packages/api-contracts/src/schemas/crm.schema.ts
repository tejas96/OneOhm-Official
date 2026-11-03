import {
  LEAD_LOST_REASONS,
  LEAD_SOURCES,
  LEAD_STAGES,
  LOCATION_SOURCES,
  SUBSIDY_CATEGORIES,
} from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';

/** A time of day on the business clock, "HH:MM". */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, for example 16:30.');

export const leadStageSchema = z.enum(LEAD_STAGES);
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export const subsidyCategorySchema = z.enum(SUBSIDY_CATEGORIES);
export const leadLostReasonSchema = z.enum(LEAD_LOST_REASONS);

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
  /** Optional time on that day, "HH:MM". */
  nextActionTime: z.string().nullable(),
  nextActionNote: z.string().nullable(),
  /** An open lead whose next action date has passed (PRD 3.3: never silent). */
  overdue: z.boolean(),
  customerId: idSchema.nullable(),
  propertyId: idSchema.nullable(),
  /** Why it was lost, from the list; `lostReason` holds the words. */
  lostReasonKey: leadLostReasonSchema.nullable(),
  lostReason: z.string().nullable(),
  /** A lost lead to try again on this day. */
  revisitOn: calendarDateSchema.nullable(),
  /** Lost, and its revisit day has come: it is back in the owner's follow-ups. */
  revisitDue: z.boolean(),
  notes: z.string().nullable(),
  /** The customer who referred this lead, if any. */
  referredBy: z.object({ id: idSchema, name: z.string() }).nullable(),
  /** A customer already on file with this phone number (PRD 3.3: matching). */
  matchedCustomer: z.object({ id: idSchema, name: z.string() }).nullable(),
  createdAt: instantSchema,
});
export type Lead = z.infer<typeof leadSchema>;

export const leadActivitySchema = z.object({
  id: idSchema,
  kind: z.enum(['note', 'call', 'visit', 'whatsapp', 'stage_change', 'follow_up']),
  note: z.string(),
  user: userRefSchema.nullable(),
  /** Staff-only; never sent to resellers. */
  internal: z.boolean(),
  createdAt: instantSchema,
});

/** A quotation made for the lead, as the lead screens list it. */
export const leadQuotationSchema = z.object({
  id: idSchema,
  number: z.string(),
  revision: z.number().int(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'superseded']),
  capacityWp: z.number().int(),
  effectivePaise: z.number().int(),
  discountPendingApproval: z.boolean(),
  createdAt: instantSchema,
});
export type LeadQuotation = z.infer<typeof leadQuotationSchema>;

/** Where the lead came from (first touch); every part is null when it was not captured. */
export const leadAttributionSchema = z.object({
  campaignCode: z.string().nullable(),
  /** The campaign's name from Settings → Selling, when the code is on the list. */
  campaignName: z.string().nullable(),
  adId: z.string().nullable(),
  adHeadline: z.string().nullable(),
  adSourceUrl: z.string().nullable(),
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  landingPage: z.string().nullable(),
});
export type LeadAttributionRecord = z.infer<typeof leadAttributionSchema>;

export const leadDetailSchema = leadSchema.extend({
  attribution: leadAttributionSchema,
  activities: z.array(leadActivitySchema),
  quotations: z.array(leadQuotationSchema),
  /** True when the lead came from a reseller: staff notes can be kept from them. */
  fromReseller: z.boolean(),
});
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
  /** The EV charging meter, from a completed New EV meter request (PRD 3.15). */
  evMeterNumber: z.string().nullable().optional(),
  subsidyClaimed: z.boolean(),
  /** A low-income household: the state top-up may apply (PRD 3.5). */
  lowIncomeHousehold: z.boolean().optional(),
  floors: z.number().int(),
  /** The site's GPS point; photos and check-ins are checked against it. */
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** How the point was set, when it was, and whether a far-off pin is waiting for review. */
  locationSource: z.enum(LOCATION_SOURCES).nullable().optional(),
  locatedAt: instantSchema.nullable().optional(),
  locationFlagged: z.boolean().optional(),
  locationFlagDistanceM: z.number().int().nullable().optional(),
  /** True when an earlier point is kept and can be restored. */
  hasPreviousLocation: z.boolean().optional(),
});
export type Property = z.infer<typeof propertySchema>;

export const customerSchema = z.object({
  id: idSchema,
  kind: z.enum(['individual', 'organization']),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  gstin: z.string().nullable(),
  createdAt: instantSchema,
  propertyCount: z.number().int(),
  projectCount: z.number().int(),
});
export type Customer = z.infer<typeof customerSchema>;

/** Another OneOhm account on the customer's phone: shown, never merged (PRD 3.2). */
export const customerAccountSchema = z.object({
  kind: z.enum(['staff', 'reseller', 'crew', 'contractor', 'vendor']),
  name: z.string(),
});
export type CustomerAccount = z.infer<typeof customerAccountSchema>;
