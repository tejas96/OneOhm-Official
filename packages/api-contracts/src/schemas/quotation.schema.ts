import {
  EXTRA_KINDS,
  LINE_CATEGORIES,
  MAX_INVERTER_MODELS,
  MAX_INVERTERS_PER_MODEL,
  STRUCTURE_TYPES,
} from '@oneohm/domain';
import { z } from 'zod';
import {
  calendarDateSchema,
  idSchema,
  instantSchema,
  paiseSchema,
  unitSchema,
} from '../common/primitives';
import { costingDetailSchema, quotationCostingSchema } from './costing.schema';
import { subsidyCategorySchema } from './crm.schema';

export const systemTypeSchema = z.enum(['on_grid', 'hybrid', 'off_grid']);
export const structureTypeSchema = z.enum(STRUCTURE_TYPES);
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
  'no_households',
]);

/** Why the state top-up is ₹0 (PRD 3.5); `no_rule` means no state scheme is set up. */
export const stateSupportIneligibleSchema = z.enum([
  'no_rule',
  'not_low_income',
  'not_residential',
  'other_state',
  'no_central_subsidy',
]);

export const extraKindSchema = z.enum(EXTRA_KINDS);

/**
 * A line sales adds by hand (PRD 3.5, 3.9): an optional item (shown, not in the total),
 * a gift (free, its cost kept), a site-specific charge, or an adjustment up or down.
 * Anything but an optional item needs a reason. With `productId`, the catalog fills the
 * price, cost and GST.
 */
export const extraLineInputSchema = z
  .object({
    kind: extraKindSchema,
    productId: idSchema.nullable().optional(),
    description: z.string().trim().min(2, 'Describe the item.').max(160),
    quantity: z.number().positive().max(10_000).default(1),
    unit: unitSchema.default('nos'),
    unitPricePaise: paiseSchema.min(-10_00_00_000).max(10_00_00_000).default(0),
    unitCostPaise: paiseSchema.min(0).max(10_00_00_000).default(0),
    reason: z.string().trim().max(300).default(''),
  })
  .superRefine((line, context) => {
    if (line.kind !== 'optional' && line.reason.length < 3)
      context.addIssue({ code: 'custom', path: ['reason'], message: 'Say why this line is here.' });
    if (line.kind === 'adjustment' && line.unitPricePaise === 0)
      context.addIssue({ code: 'custom', path: ['unitPricePaise'], message: 'Enter the amount.' });
    if (line.kind !== 'adjustment' && line.unitPricePaise < 0)
      context.addIssue({
        code: 'custom',
        path: ['unitPricePaise'],
        message: 'Use an adjustment to lower the price.',
      });
  });
export type ExtraLineInput = z.infer<typeof extraLineInputSchema>;

/** One inverter model on a quotation and how many of it. */
export const inverterPickSchema = z.object({
  productId: idSchema,
  quantity: z.number().int().min(1).max(MAX_INVERTERS_PER_MODEL),
});
export type InverterPickInput = z.infer<typeof inverterPickSchema>;

/** What sales chooses; everything else comes from the property, catalog and rate card. */
export const quotationInputSchema = z.object({
  propertyId: idSchema,
  leadId: idSchema.nullable().optional(),
  subsidyCategory: subsidyCategorySchema,
  households: z.number().int().positive().nullable().optional(),
  systemType: systemTypeSchema,
  targetWp: z.number().int().min(500).max(2_000_000),
  panelProductId: idSchema,
  /** The inverters: one row per model, in the order picked. The first is the main one. */
  inverters: z.array(inverterPickSchema).min(1).max(MAX_INVERTER_MODELS).optional(),
  /**
   * Older clients send one inverter here; it reads as one row. The API needs this or
   * `inverters`. A saved quotation always returns both, this one being the main inverter.
   */
  inverterProductId: idSchema.optional(),
  batteryProductId: idSchema.nullable().optional(),
  structureType: structureTypeSchema,
  floors: z.number().int().min(0).max(40),
  distanceKm: z.number().int().min(0).max(1000),
  dcCableMeters: z.number().positive().nullable().optional(),
  acCableMeters: z.number().positive().nullable().optional(),
  discountPaise: paiseSchema.min(0).default(0),
  extras: z.array(extraLineInputSchema).max(20).optional(),
  /** Measured runs, structure, crew and site detail; left out, the site type's defaults apply. */
  costing: costingDetailSchema.nullable().optional(),
});
export type QuotationInput = z.infer<typeof quotationInputSchema>;

/**
 * A preview can price a fresh lead before any site is on record: without `propertyId`,
 * the site facts that affect the subsidy come from these fields instead.
 */
export const quotationPreviewInputSchema = quotationInputSchema.extend({
  propertyId: idSchema.nullable().optional(),
  meterInSocietyName: z.boolean().nullable().optional(),
  subsidyClaimed: z.boolean().optional(),
});
export type QuotationPreviewInput = z.infer<typeof quotationPreviewInputSchema>;

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
  /** Set on lines added by hand, with the reason given. */
  extra: extraKindSchema.nullable().optional(),
  reason: z.string().nullable().optional(),
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
  /** Optional items offered, with GST; never part of the total. */
  optionalPaise: paiseSchema.optional(),
  /** Expected state support for a low-income household (PRD 3.5); shown only, never revenue. */
  stateSupportPaise: paiseSchema.optional(),
  stateSupportIneligible: stateSupportIneligibleSchema.nullable().optional(),
});
export type QuotationTotals = z.infer<typeof quotationTotalsSchema>;

export const quotationPreviewSchema = z.object({
  totals: quotationTotalsSchema,
  lines: z.array(quotationLineSchema),
  /** The same system with DCR and non-DCR panels side by side (PRD 3.5). */
  comparison: z.object({ dcr: quotationTotalsSchema, nonDcr: quotationTotalsSchema }).nullable(),
  /** Discounts above the limit wait for an approver. */
  discountNeedsApproval: z.boolean(),
  /** How the price was reached, and the detail the engine used. */
  costing: quotationCostingSchema.optional(),
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
  /** What the customer said when turning it down. */
  rejectionReason: z.string().nullable().optional(),
  /** How the price was reached, from its saved lines and the rates it snapshotted. */
  costing: quotationCostingSchema.optional(),
});
export type QuotationDetail = z.infer<typeof quotationDetailSchema>;
