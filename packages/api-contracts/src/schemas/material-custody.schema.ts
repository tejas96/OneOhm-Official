import { CUSTODY_KINDS, LINE_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';
import { quantitySchema } from './inventory.schema';

/**
 * Material with contractors (PRD 3.10, 3.13, 4.9): issue slips from the store, usage
 * recorded by the crew or at task completion, and returns to the store. Quantities only:
 * crews read these too, so no prices or costs appear here.
 */
export const custodyKindSchema = z.enum(CUSTODY_KINDS);
export type CustodyKindValue = z.infer<typeof custodyKindSchema>;

const ref = z.object({ id: idSchema, name: z.string() });
const projectRef = z.object({ id: idSchema, code: z.string(), name: z.string() });

/** One item a contractor holds for one project. */
export const custodyHoldingSchema = z.object({
  productId: idSchema,
  name: z.string(),
  brand: z.string(),
  category: z.enum(LINE_CATEGORIES),
  unit: z.string(),
  serialised: z.boolean(),
  /** The quotation line it serves; null for items not on the quotation. */
  lineKey: z.string().nullable(),
  issued: z.number(),
  used: z.number(),
  returned: z.number(),
  balance: z.number(),
  /** Serialised items still out for this project, to pick from on a return. */
  serials: z.array(z.string()),
});
export type CustodyHolding = z.infer<typeof custodyHoldingSchema>;

/** What one contractor holds on one project. */
export const custodyProjectSchema = z.object({
  contractor: ref,
  project: projectRef,
  /** Every installation task is done: what is left should come back to the store. */
  installed: z.boolean(),
  holdings: z.array(custodyHoldingSchema),
});
export type CustodyProject = z.infer<typeof custodyProjectSchema>;

export const materialSlipSchema = z.object({
  id: idSchema,
  number: z.string(),
  kind: custodyKindSchema,
  contractor: ref,
  project: projectRef,
  occurredOn: calendarDateSchema,
  note: z.string().nullable(),
  locationName: z.string().nullable(),
  dispatchNumber: z.string().nullable(),
  taskTitle: z.string().nullable(),
  photoDocumentId: idSchema.nullable(),
  recordedBy: z.string().nullable(),
  createdAt: instantSchema,
  lines: z.array(
    z.object({
      productId: idSchema,
      name: z.string(),
      unit: z.string(),
      lineKey: z.string().nullable(),
      quantity: z.number(),
      serials: z.array(z.string()),
    }),
  ),
});
export type MaterialSlip = z.infer<typeof materialSlipSchema>;

export const reconciliationWarningSchema = z.enum(['unaccounted', 'over_used']);

/** One quotation line (or an extra item) from quotation to roof. */
export const reconciliationRowSchema = z.object({
  /** panel, dc_cable, structure…; null for an item issued that is not on the quotation. */
  lineKey: z.string().nullable(),
  description: z.string(),
  category: z.enum(LINE_CATEGORIES),
  unit: z.string(),
  /** The stock item the quotation names (panels, inverter, battery); null for the rest. */
  quoteProductId: idSchema.nullable(),
  /** Stock items issued against this line so far. */
  productNames: z.array(z.string()),
  productIds: z.array(idSchema),
  needed: z.number().nullable(),
  /** Held and sent on a challan; null when the quotation names no stock item for it. */
  reserved: z.number().nullable(),
  dispatched: z.number().nullable(),
  issued: z.number(),
  used: z.number(),
  returned: z.number(),
  withContractor: z.number(),
  /** Used less needed: positive is more than quoted. */
  difference: z.number().nullable(),
  warning: reconciliationWarningSchema.nullable(),
});
export type ReconciliationRow = z.infer<typeof reconciliationRowSchema>;

export const projectCustodySchema = z.object({
  projectId: idSchema,
  projectCode: z.string(),
  installed: z.boolean(),
  rows: z.array(reconciliationRowSchema),
  holdings: z.array(custodyProjectSchema),
  slips: z.array(materialSlipSchema),
  /** Contractors with a work order on this project, who material can be issued to. */
  contractors: z.array(ref.extend({ workOrderNumber: z.string() })),
});
export type ProjectCustody = z.infer<typeof projectCustodySchema>;

/** Everything one contractor holds, per project, and their recent slips. */
export const contractorMaterialSchema = z.object({
  contractor: ref,
  projects: z.array(custodyProjectSchema),
  slips: z.array(materialSlipSchema),
});
export type ContractorMaterial = z.infer<typeof contractorMaterialSchema>;

const slipLineInputSchema = z.object({
  productId: idSchema,
  lineKey: z.string().trim().min(1).max(40).nullable().default(null),
  quantity: quantitySchema.refine((value) => value > 0, 'Enter a quantity above 0.'),
  /** Serialised items on a return: one serial per unit. Issues pick serials themselves. */
  serials: z.array(z.string().trim().min(1).max(80)).max(500).default([]),
});

const note = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .default(null);

const slipBase = {
  occurredOn: calendarDateSchema,
  note,
  lines: z.array(slipLineInputSchema).min(1, 'Add at least one item.').max(60),
};

export const issueInputSchema = z.object({
  contractorId: idSchema,
  locationId: idSchema.nullable().default(null),
  ...slipBase,
});
export type IssueInput = z.input<typeof issueInputSchema>;
export type IssueData = z.output<typeof issueInputSchema>;

export const usageInputSchema = z.object({
  contractorId: idSchema,
  taskId: idSchema.nullable().default(null),
  ...slipBase,
});
export type UsageInput = z.input<typeof usageInputSchema>;
export type UsageData = z.output<typeof usageInputSchema>;

export const returnInputSchema = z.object({
  contractorId: idSchema,
  locationId: idSchema.nullable().default(null),
  ...slipBase,
});
export type ReturnInput = z.input<typeof returnInputSchema>;
export type ReturnData = z.output<typeof returnInputSchema>;

/** A crew records what went into the system on one of its projects. */
export const crewUsageInputSchema = usageInputSchema
  .omit({ contractorId: true })
  .extend({ projectId: idSchema });
export type CrewUsageInput = z.input<typeof crewUsageInputSchema>;
export type CrewUsageData = z.output<typeof crewUsageInputSchema>;
