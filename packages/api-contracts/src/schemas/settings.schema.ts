import { LINE_CATEGORIES, SUBSIDY_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { gstRateSchema } from '../common/gst-rate';
import {
  calendarDateSchema,
  idSchema,
  instantSchema,
  nameSchema,
  unitSchema,
} from '../common/primitives';
import { costingCardSchema } from './costing.schema';

const amountSchema = z.number().int().nonnegative('Use zero or more.');
/** The price engine's configurable rates (PRD 3.9): the costing card. Amounts are paise. */
export const rateCardSchema = costingCardSchema;
export type RateCardValues = z.infer<typeof rateCardSchema>;

export const rateCardSettingsSchema = z.object({
  name: z.string(),
  /** True while the seeded starter values have never been saved from Settings. */
  starter: z.boolean(),
  updatedAt: instantSchema,
  rates: rateCardSchema,
});
export type RateCardSettings = z.infer<typeof rateCardSettingsSchema>;

export const productInputSchema = z.object({
  sku: z.string().trim().min(1, 'Add a SKU.').max(40).toUpperCase(),
  name: nameSchema,
  brand: z.string().trim().min(1, 'Add the brand.').max(80),
  category: z.enum(LINE_CATEGORIES),
  unit: unitSchema,
  wattageWp: z.number().int().positive().max(2000).nullable(),
  ratedW: z.number().int().positive().max(5_000_000).nullable(),
  dcr: z.boolean(),
  pricePaise: amountSchema,
  costPaise: amountSchema,
  taxRateBp: gstRateSchema,
  efficiencyBp: z
    .number()
    .int()
    .min(100, 'Use at least 1%.')
    .max(10_000, 'Use at most 100%.')
    .nullable()
    .optional(),
  technology: z.string().trim().max(80).nullable().optional(),
  warrantyYears: z.number().int().min(0).max(40, 'Use at most 40 years.').nullable().optional(),
  active: z.boolean(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const discomInputSchema = z.object({
  code: z.string().trim().min(2, 'Use at least 2 characters.').max(20).toUpperCase(),
  name: nameSchema,
  state: z.string().trim().min(2).max(80),
  expectedDays: z.number().int().min(1).max(365),
  active: z.boolean(),
});
export type DiscomInput = z.infer<typeof discomInputSchema>;

const optionalText = (max: number) => z.string().trim().max(max);

/** Company profile edits (PRD Appendix A); signatory details may stay blank until known. */
export const companyInputSchema = z.object({
  legalName: nameSchema,
  brandName: z.string().trim().min(2, 'Use at least 2 characters.').max(80),
  fullAddress: z.string().trim().min(10, 'Add the full address.').max(400),
  shortAddress: z.string().trim().min(5, 'Add a short address.').max(160),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a 15-character GSTIN.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  phones: z.array(z.string().trim().min(6).max(20)).max(6),
  signatoryName: optionalText(160),
  signatoryDesignation: optionalText(120),
  signatoryPhone: optionalText(20),
  signatoryEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === '' || z.string().email().safeParse(value).success, {
      message: 'Enter a valid email address.',
    }),
  quotationValidityDays: z.number().int().min(1).max(180),
  /** Where crews and material leave from: distances to sites are measured from here. */
  baseLatitude: z.number().min(-90).max(90).nullable().optional(),
  baseLongitude: z.number().min(-180).max(180).nullable().optional(),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const subsidyRuleSchema = z.object({
  id: idSchema,
  category: z.enum(SUBSIDY_CATEGORIES),
  validFrom: calendarDateSchema,
  slabs: z.array(
    z.object({
      fromWp: z.number().int(),
      toWp: z.number().int().nullable(),
      paisePerKw: z.number().int(),
    }),
  ),
  capPaise: z.number().int(),
  perHouseholdWp: z.number().int().nullable(),
  maxEligibleWp: z.number().int().nullable(),
});
export type SubsidyRuleView = z.infer<typeof subsidyRuleSchema>;
