import { SUBSIDY_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, paiseSchema } from '../common/primitives';
import { subsidyRuleSchema } from './settings.schema';

/** Where a rule version stands today: history, the one in force, or one that starts later. */
export const subsidyRuleStateSchema = z.enum(['earlier', 'in_force', 'scheduled']);
export type SubsidyRuleState = z.infer<typeof subsidyRuleStateSchema>;

export const subsidyRuleVersionSchema = subsidyRuleSchema.extend({
  state: subsidyRuleStateSchema,
});
export type SubsidyRuleVersion = z.infer<typeof subsidyRuleVersionSchema>;

const slabInputSchema = z.object({
  fromWp: z.number().int().min(0, 'Use 0 kW or more.'),
  toWp: z.number().int().positive('Use more than 0 kW, or leave it open.').nullable(),
  paisePerKw: z.number().int().positive('Enter an amount per kW above ₹0.'),
});

type SlabInput = z.infer<typeof slabInputSchema>;

/**
 * Slabs climb without gaps or overlaps: the first starts at 0 kW, each starts where the
 * one before ends, ends above where it starts, and only the last may be open-ended.
 */
function checkSlabs(slabs: readonly SlabInput[], ctx: z.RefinementCtx): void {
  slabs.forEach((slab, index) => {
    const previous = index === 0 ? null : slabs[index - 1];
    if (previous && previous.toWp === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slabs', index - 1, 'toWp'],
        message: 'Only the last slab can be open-ended. Add where this one stops.',
      });
    } else if (slab.fromWp !== (previous?.toWp ?? 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slabs', index, 'fromWp'],
        message: previous
          ? 'Start this slab where the one above ends.'
          : 'The first slab starts at 0 kW.',
      });
    }
    if (slab.toWp !== null && slab.toWp <= slab.fromWp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slabs', index, 'toWp'],
        message: 'Slabs go up: end this one above where it starts.',
      });
    }
  });
}

/** A new rule version (or a change to one not yet in force), as Settings sends it. */
export const subsidyRuleInputSchema = z
  .object({
    category: z.enum(SUBSIDY_CATEGORIES),
    validFrom: calendarDateSchema,
    slabs: z.array(slabInputSchema).max(10, 'Use at most 10 slabs.'),
    capPaise: paiseSchema.min(0, 'Use ₹0 or more.'),
    /** Societies only; ignored for other categories. */
    perHouseholdWp: z.number().int().positive('Use more than 0 kW, or leave it empty.').nullable(),
    maxEligibleWp: z.number().int().positive('Use more than 0 kW, or leave it empty.').nullable(),
  })
  .superRefine((rule, ctx) => {
    checkSlabs(rule.slabs, ctx);
    if (rule.slabs.length > 0 && rule.capPaise === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capPaise'],
        message: 'Set the most a customer can get, or remove the slabs for no subsidy.',
      });
    }
  });
export type SubsidyRuleInput = z.infer<typeof subsidyRuleInputSchema>;

/** One open quotation whose expected subsidy differs under the rules in force on a date. */
export const subsidyImpactRowSchema = z.object({
  id: idSchema,
  number: z.string(),
  revision: z.number().int(),
  status: z.enum(['draft', 'sent']),
  customer: z.object({ id: idSchema, name: z.string() }),
  propertyLabel: z.string(),
  category: z.enum(SUBSIDY_CATEGORIES),
  capacityWp: z.number().int(),
  validUntil: calendarDateSchema,
  totalPaise: paiseSchema,
  savedSubsidyPaise: paiseSchema,
  newSubsidyPaise: paiseSchema,
  savedEffectivePaise: paiseSchema,
  newEffectivePaise: paiseSchema,
});
export type SubsidyImpactRow = z.infer<typeof subsidyImpactRowSchema>;

export const subsidyImpactSchema = z.object({
  /** The date whose rules were applied: today, or a later start date. */
  asOf: calendarDateSchema,
  /** Open (draft or sent) quotations looked at. */
  checked: z.number().int(),
  quotations: z.array(subsidyImpactRowSchema),
});
export type SubsidyImpact = z.infer<typeof subsidyImpactSchema>;
