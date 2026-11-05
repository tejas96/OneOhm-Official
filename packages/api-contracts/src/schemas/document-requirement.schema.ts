import { DOCUMENT_CATEGORIES, PROJECT_TYPES } from '@oneohm/domain';
import { z } from 'zod';

/** When a paper is needed; leave a field out to mean "any" (PRD 3.14). */
export const requirementConditionsSchema = z.object({
  types: z.array(z.enum(PROJECT_TYPES)).optional(),
  loan: z.boolean().optional(),
  subsidy: z.boolean().optional(),
  nameChange: z.boolean().optional(),
  discomCodes: z.array(z.string().trim().toUpperCase().min(2).max(20)).max(20).optional(),
});

export const documentRequirementSchema = z.object({
  key: z.string(),
  label: z.string(),
  why: z.string(),
  categories: z.array(z.enum(DOCUMENT_CATEGORIES)),
  fromCustomer: z.boolean(),
  conditions: requirementConditionsSchema,
  active: z.boolean(),
  position: z.number().int(),
  builtIn: z.boolean(),
  /** A paper older than this many days stops counting; null means never. */
  maxAgeDays: z.number().int().nullable(),
});
export type DocumentRequirementRecord = z.infer<typeof documentRequirementSchema>;

export const documentRequirementInputSchema = z.object({
  label: z.string().trim().min(3, 'Name the paper.').max(120),
  why: z.string().trim().max(200).default(''),
  categories: z.array(z.enum(DOCUMENT_CATEGORIES)).min(1, 'Pick the folder it is filed in.'),
  fromCustomer: z.boolean().default(false),
  conditions: requirementConditionsSchema.default({}),
  maxAgeDays: z.number().int().min(1).max(3650).nullable().optional(),
});
export type DocumentRequirementInput = z.input<typeof documentRequirementInputSchema>;

export const documentRequirementUpdateSchema = documentRequirementInputSchema.partial().extend({
  active: z.boolean().optional(),
  move: z.enum(['up', 'down']).optional(),
});
