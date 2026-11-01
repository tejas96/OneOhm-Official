import {
  ASSET_KINDS,
  MAX_AMC_MONTHS,
  MAX_VISITS_PER_YEAR,
  MAX_WARRANTY_YEARS,
} from '@oneohm/domain';
import { z } from 'zod';
import {
  calendarDateSchema,
  idSchema,
  instantSchema,
  nameSchema,
  noteSchema,
  paiseSchema,
} from '../common/primitives';
import { SERVICE_STATUSES, serviceCategoryKeySchema } from './service-desk.schema';

/* ---------- Settings: service categories and their hours (PRD 7.2) ---------- */

export const serviceCategorySchema = z.object({
  id: idSchema,
  key: serviceCategoryKeySchema,
  label: z.string(),
  customerLabel: z.string(),
  responseHours: z.number().int(),
  resolutionHours: z.number().int(),
  system: z.boolean(),
  active: z.boolean(),
});
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;

const hoursSchema = (max: number) =>
  z.number().int().min(1, 'Use at least 1 hour.').max(max, `Use at most ${max} hours.`);

/** Resolution must not come before the first response, except for planned visits (API). */
export const serviceCategoryInputSchema = z.object({
  label: nameSchema,
  customerLabel: nameSchema,
  responseHours: hoursSchema(720),
  resolutionHours: hoursSchema(4320),
  active: z.boolean(),
});
export type ServiceCategoryInput = z.infer<typeof serviceCategoryInputSchema>;

/* ---------- Settings: warranty years per product kind ---------- */

const yearsSchema = z
  .number()
  .int()
  .min(0, 'Use zero or more.')
  .max(MAX_WARRANTY_YEARS, `Use at most ${MAX_WARRANTY_YEARS} years.`);
const termSchema = z.object({
  years: yearsSchema,
  performanceYears: yearsSchema.min(1, 'Use at least 1 year.').nullable(),
});
export const warrantyPolicySchema = z.object({
  panel: termSchema,
  inverter: termSchema,
  battery: termSchema,
  structure: termSchema,
  workmanship: termSchema,
});
export type WarrantyPolicyInput = z.infer<typeof warrantyPolicySchema>;

export const warrantySettingsSchema = z.object({
  policy: warrantyPolicySchema,
  updatedAt: instantSchema,
  updatedBy: z.string().nullable(),
});
export type WarrantySettings = z.infer<typeof warrantySettingsSchema>;

/* ---------- Settings: AMC plans ---------- */

export const amcPlanInputSchema = z.object({
  name: nameSchema,
  pricePaise: paiseSchema.nonnegative('Use zero or more.'),
  visitsPerYear: z.number().int().min(1, 'Plan at least 1 visit.').max(MAX_VISITS_PER_YEAR),
  durationMonths: z.number().int().min(1).max(MAX_AMC_MONTHS),
  visitName: z.string().trim().min(2, 'Use at least 2 characters.').max(40),
  includes: z.array(z.string().trim().min(1).max(120)).max(12, 'List at most 12 items.'),
  active: z.boolean(),
});
export type AmcPlanInput = z.infer<typeof amcPlanInputSchema>;

export const amcPlanSchema = amcPlanInputSchema.extend({
  id: idSchema,
  /** Contracts sold on this plan that are still running. */
  activeContracts: z.number().int(),
});
export type AmcPlan = z.infer<typeof amcPlanSchema>;

/* ---------- A project's installed system, warranties and AMCs ---------- */

export const WARRANTY_STATES = ['active', 'ending_soon', 'ended'] as const;
export const AMC_STATES = ['upcoming', 'active', 'ended', 'cancelled'] as const;

export const installedAssetSchema = z.object({
  id: idSchema,
  kind: z.enum(ASSET_KINDS),
  make: z.string().nullable(),
  model: z.string(),
  quantity: z.number().int(),
  serialNumbers: z.array(z.string()),
  warrantyStartsOn: calendarDateSchema,
  warrantyEndsOn: calendarDateSchema,
  performanceEndsOn: calendarDateSchema.nullable(),
  warrantyState: z.enum(WARRANTY_STATES),
});
export type InstalledAsset = z.infer<typeof installedAssetSchema>;

export const installedAssetPatchSchema = z.object({
  make: z.string().trim().max(80).nullable(),
  model: z.string().trim().min(1, 'Add the model.').max(160),
  serialNumbers: z.array(z.string().trim().min(1).max(80)).max(500),
});
export type InstalledAssetPatch = z.infer<typeof installedAssetPatchSchema>;

export const amcVisitSchema = z.object({
  id: idSchema,
  position: z.number().int(),
  dueOn: calendarDateSchema,
  request: z.object({ id: idSchema, status: z.enum(SERVICE_STATUSES) }).nullable(),
});
export type AmcVisit = z.infer<typeof amcVisitSchema>;

export const amcContractSchema = z.object({
  id: idSchema,
  planName: z.string(),
  visitName: z.string(),
  includes: z.array(z.string()),
  startsOn: calendarDateSchema,
  endsOn: calendarDateSchema,
  pricePaise: paiseSchema,
  note: z.string().nullable(),
  state: z.enum(AMC_STATES),
  soldBy: z.string().nullable(),
  createdAt: instantSchema,
  visits: z.array(amcVisitSchema),
});
export type AmcContract = z.infer<typeof amcContractSchema>;

export const amcSaleInputSchema = z.object({
  planId: idSchema,
  startsOn: calendarDateSchema,
  pricePaise: paiseSchema.nonnegative('Use zero or more.'),
  note: noteSchema.optional(),
});
export type AmcSaleInput = z.infer<typeof amcSaleInputSchema>;

export const projectAfterSalesSchema = z.object({
  /** When testing and commissioning finished; warranties start then. */
  commissionedOn: calendarDateSchema.nullable(),
  assets: z.array(installedAssetSchema),
  amcs: z.array(amcContractSchema),
});
export type ProjectAfterSales = z.infer<typeof projectAfterSalesSchema>;

/* ---------- The customer's view (PRD 5.5) ---------- */

export const customerServiceCategorySchema = z.object({
  key: serviceCategoryKeySchema,
  label: z.string(),
});
export type CustomerServiceCategory = z.infer<typeof customerServiceCategorySchema>;

export const customerCoverSchema = z.object({
  projectId: idSchema,
  projectCode: z.string(),
  commissionedOn: calendarDateSchema.nullable(),
  assets: z.array(installedAssetSchema.omit({ id: true, serialNumbers: true })),
  amc: z
    .object({
      planName: z.string(),
      startsOn: calendarDateSchema,
      endsOn: calendarDateSchema,
      includes: z.array(z.string()),
      visitsTotal: z.number().int(),
      visitsDone: z.number().int(),
      state: z.enum(AMC_STATES),
    })
    .nullable(),
});
export type CustomerCover = z.infer<typeof customerCoverSchema>;

export const customerVisitSchema = z.object({
  id: idSchema,
  projectCode: z.string(),
  dueOn: calendarDateSchema,
  visitName: z.string(),
  planName: z.string(),
  status: z.enum(SERVICE_STATUSES).nullable(),
});
export type CustomerVisit = z.infer<typeof customerVisitSchema>;

export const customerAfterSalesSchema = z.object({
  projects: z.array(customerCoverSchema),
  upcomingVisits: z.array(customerVisitSchema),
});
export type CustomerAfterSales = z.infer<typeof customerAfterSalesSchema>;

export const serviceRatingInputSchema = z.object({
  rating: z.number().int().min(1, 'Choose a rating.').max(5),
  comment: noteSchema.optional(),
});
