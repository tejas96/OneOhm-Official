import { LINE_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, paiseSchema } from '../common/primitives';

export const productSchema = z.object({
  id: idSchema,
  sku: z.string(),
  name: z.string(),
  brand: z.string(),
  category: z.enum(LINE_CATEGORIES),
  unit: z.string(),
  wattageWp: z.number().int().nullable(),
  ratedW: z.number().int().nullable(),
  dcr: z.boolean(),
  pricePaise: paiseSchema,
  costPaise: paiseSchema,
  taxRateBp: z.number().int(),
  /** Specifications printed on quotations (PRD 3.5); efficiency in basis points. */
  efficiencyBp: z.number().int().nullable().optional(),
  technology: z.string().nullable().optional(),
  warrantyYears: z.number().int().nullable().optional(),
  /** The maker's datasheet, when uploaded. */
  datasheet: z.object({ id: idSchema, name: z.string() }).nullable().optional(),
  active: z.boolean(),
});
export type Product = z.infer<typeof productSchema>;

export const discomSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  state: z.string(),
  expectedDays: z.number().int(),
  active: z.boolean(),
});
export type Discom = z.infer<typeof discomSchema>;

export const companySchema = z.object({
  legalName: z.string(),
  brandName: z.string(),
  fullAddress: z.string(),
  shortAddress: z.string(),
  gstin: z.string(),
  email: z.string(),
  phones: z.array(z.string()),
  signatoryName: z.string(),
  signatoryDesignation: z.string(),
  signatoryPhone: z.string(),
  signatoryEmail: z.string(),
  quotationValidityDays: z.number().int(),
});
export type Company = z.infer<typeof companySchema>;
