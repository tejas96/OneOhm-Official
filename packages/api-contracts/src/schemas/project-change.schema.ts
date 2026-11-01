import { PROJECT_CHANGE_KINDS, PROJECT_CHANGE_STATUSES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import {
  extraLineInputSchema,
  quotationStatusSchema,
  structureTypeSchema,
} from './quotation.schema';

export const projectChangeKindSchema = z.enum(PROJECT_CHANGE_KINDS);
export const projectChangeStatusSchema = z.enum(PROJECT_CHANGE_STATUSES);

/**
 * "Change scope" on a live project (PRD 3.6, 3.15): the new choices, filled in from the
 * accepted quotation, and why. Everything else (site, discount, measurements) stays.
 */
export const projectChangeInputSchema = z.object({
  targetWp: z.number().int().min(500).max(2_000_000),
  panelProductId: idSchema,
  inverterProductId: idSchema,
  batteryProductId: idSchema.nullable(),
  structureType: structureTypeSchema,
  extras: z.array(extraLineInputSchema).max(20),
  reason: z.string().trim().min(3, 'Say why the scope changes.').max(300),
});
export type ProjectChangeInput = z.infer<typeof projectChangeInputSchema>;

const priceSideSchema = z.object({
  totalPaise: paiseSchema,
  subsidyPaise: paiseSchema,
  subsidyIneligible: z.string().nullable(),
  stateSupportPaise: paiseSchema,
  effectivePaise: paiseSchema,
  capacityWp: z.number().int(),
});

/** The system in a line each, before and after, for people to compare. */
const scopeViewSchema = z.object({
  capacityWp: z.number().int(),
  moduleCount: z.number().int(),
  panel: z.object({ name: z.string(), dcr: z.boolean() }),
  inverter: z.string(),
  battery: z.string().nullable(),
  structureType: structureTypeSchema,
  extras: z.array(z.string()),
});

const taskRefSchema = z.object({
  key: z.string(),
  title: z.string(),
  status: z.string().optional(),
});

/** Everything shown before approval: price, subsidy, timeline and material (PRD 3.15). */
export const projectChangeImpactSchema = z.object({
  kinds: z.array(projectChangeKindSchema),
  scope: z.object({ before: scopeViewSchema, after: scopeViewSchema }),
  price: z.object({
    before: priceSideSchema,
    after: priceSideSchema,
    differencePaise: paiseSchema,
    subsidyDifferencePaise: paiseSchema,
    stateSupportDifferencePaise: paiseSchema,
    effectiveDifferencePaise: paiseSchema,
  }),
  /** Which customer payment takes the difference, or null when finance must settle it. */
  payment: z.object({ label: z.string().nullable(), newAmountPaise: paiseSchema.nullable() }),
  tasks: z.object({
    added: z.array(
      taskRefSchema.extend({ startDate: calendarDateSchema, dueDate: calendarDateSchema }),
    ),
    removed: z.array(taskRefSchema),
    kept: z.array(taskRefSchema),
    moved: z.number().int(),
    finishBefore: calendarDateSchema.nullable(),
    finishAfter: calendarDateSchema.nullable(),
    finishMoveDays: z.number().int(),
  }),
  material: z.array(
    z.object({
      productId: idSchema,
      name: z.string(),
      unit: z.string(),
      before: z.number(),
      after: z.number(),
      delta: z.number(),
      /** Held in the store for this project now. */
      reserved: z.number(),
    }),
  ),
});
export type ProjectChangeImpact = z.infer<typeof projectChangeImpactSchema>;

export const projectChangeSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  number: z.number().int(),
  status: projectChangeStatusSchema,
  kinds: z.array(projectChangeKindSchema),
  reason: z.string(),
  impact: projectChangeImpactSchema,
  quotation: z
    .object({
      id: idSchema,
      number: z.string(),
      revision: z.number().int(),
      status: quotationStatusSchema,
    })
    .nullable(),
  raisedBy: z.string().nullable(),
  raisedAt: instantSchema,
  approvedBy: z.string().nullable(),
  approvedAt: instantSchema.nullable(),
  closedAt: instantSchema.nullable(),
  closeReason: z.string().nullable(),
});
export type ProjectChange = z.infer<typeof projectChangeSchema>;

/** A change waiting for the customer, as the customer app shows it (read only). */
export const customerPendingChangeSchema = z.object({
  number: z.number().int(),
  kinds: z.array(projectChangeKindSchema),
  quotationNumber: z.string(),
  revision: z.number().int(),
  newTotalPaise: paiseSchema,
  differencePaise: paiseSchema,
  newEffectivePaise: paiseSchema,
});
export type CustomerPendingChange = z.infer<typeof customerPendingChangeSchema>;
