import { LINE_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { subsidyCategorySchema } from './crm.schema';

export const systemTypeSchema = z.enum(['on_grid', 'hybrid', 'off_grid']);
export const structureTypeSchema = z.enum(['rcc_elevated', 'tin_shed', 'ground_mount']);
export const quotationStatusSchema = z.enum([
  'draft',
  'sent',
  'accepted',
  'rejected',
  'superseded',
]);
export const subsidyIneligibleSchema = z.enum([
  'commercial',
  'non_dcr_panels',
  'off_grid',
  'meter_not_in_society_name',
  'already_subsidised',
  'no_rule',
]);

/** What sales chooses; everything else comes from the property, catalog and rate card. */
export const quotationInputSchema = z.object({
  propertyId: idSchema,
  leadId: idSchema.nullable().optional(),
  subsidyCategory: subsidyCategorySchema,
  households: z.number().int().positive().nullable().optional(),
  systemType: systemTypeSchema,
  targetWp: z.number().int().min(500).max(2_000_000),
  panelProductId: idSchema,
  inverterProductId: idSchema,
  batteryProductId: idSchema.nullable().optional(),
  structureType: structureTypeSchema,
  floors: z.number().int().min(0).max(40),
  distanceKm: z.number().int().min(0).max(1000),
  dcCableMeters: z.number().positive().nullable().optional(),
  acCableMeters: z.number().positive().nullable().optional(),
  discountPaise: paiseSchema.min(0).default(0),
});
export type QuotationInput = z.infer<typeof quotationInputSchema>;

export const quotationLineSchema = z.object({
  key: z.string(),
  description: z.string(),
  category: z.enum(LINE_CATEGORIES),
  quantity: z.number(),
  unit: z.string(),
  unitPricePaise: paiseSchema,
  taxRateBp: z.number().int(),
  basis: z.enum(['catalog', 'default', 'survey']),
  amountPaise: paiseSchema,
  contingencyPaise: paiseSchema,
  discountPaise: paiseSchema,
  taxPaise: paiseSchema,
  totalPaise: paiseSchema,
  costPaise: paiseSchema,
});

export const quotationTotalsSchema = z.object({
  moduleCount: z.number().int(),
  capacityWp: z.number().int(),
  subtotalPaise: paiseSchema,
  contingencyPaise: paiseSchema,
  discountPaise: paiseSchema,
  taxPaise: paiseSchema,
  totalPaise: paiseSchema,
  costPaise: paiseSchema,
  marginPaise: paiseSchema,
  subsidyPaise: paiseSchema,
  subsidyIneligible: subsidyIneligibleSchema.nullable(),
  effectivePaise: paiseSchema,
});
export type QuotationTotals = z.infer<typeof quotationTotalsSchema>;

export const quotationPreviewSchema = z.object({
  totals: quotationTotalsSchema,
  lines: z.array(quotationLineSchema),
  /** The same system with DCR and non-DCR panels side by side (PRD 3.5). */
  comparison: z.object({ dcr: quotationTotalsSchema, nonDcr: quotationTotalsSchema }).nullable(),
  /** Discounts above the limit wait for an approver. */
  discountNeedsApproval: z.boolean(),
});
export type QuotationPreview = z.infer<typeof quotationPreviewSchema>;

export const quotationSummarySchema = z.object({
  id: idSchema,
  number: z.string(),
  revision: z.number().int(),
  status: quotationStatusSchema,
  customer: z.object({ id: idSchema, name: z.string() }),
  propertyLabel: z.string(),
  capacityWp: z.number().int(),
  totalPaise: paiseSchema,
  subsidyPaise: paiseSchema,
  effectivePaise: paiseSchema,
  discountPendingApproval: z.boolean(),
  validUntil: calendarDateSchema,
  createdAt: instantSchema,
  projectId: idSchema.nullable(),
});
export type QuotationSummary = z.infer<typeof quotationSummarySchema>;

export const quotationDetailSchema = quotationSummarySchema.extend({
  input: quotationInputSchema,
  totals: quotationTotalsSchema,
  lines: z.array(quotationLineSchema),
  customerPhone: z.string(),
});
export type QuotationDetail = z.infer<typeof quotationDetailSchema>;
