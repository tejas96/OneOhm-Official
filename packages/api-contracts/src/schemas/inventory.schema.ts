import { LINE_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import {
  calendarDateSchema,
  idSchema,
  instantSchema,
  nameSchema,
  paiseSchema,
} from '../common/primitives';
import { optional, optionalPhone } from './optional-fields';

/** Stock quantities: metres of cable can be fractional; at most 3 decimals. */
export const quantitySchema = z
  .number()
  .finite()
  .refine(
    (value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6,
    'Use up to 3 decimals.',
  );

/** The 24-hour hold after a payee's saved bank details changed (spec decision 2). */
export const payeeBankHoldSchema = z.object({
  changedAt: instantSchema.nullable(),
  changedByName: z.string().nullable(),
  /** No bank transfer goes to the new details before this time. */
  until: instantSchema,
  /** The viewer approves payments and did not make the change. */
  canRelease: z.boolean(),
});
export type PayeeBankHold = z.infer<typeof payeeBankHoldSchema>;

export const vendorSchema = z.object({
  id: idSchema,
  name: z.string(),
  gstin: z.string().nullable(),
  /** The vendor's own PAN, for TDS; blank when none is saved. */
  pan: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  paymentTermsDays: z.number().int(),
  /** Bank details for bank transfers; the account number is shown masked only. */
  bankAccountName: z.string().nullable(),
  bankIfsc: z.string().nullable(),
  bankAccountMasked: z.string().nullable(),
  /** Null when no hold is running. */
  bankHold: payeeBankHoldSchema.nullable(),
  /** First entered in the last 7 days and nothing paid to them by bank yet. */
  bankIsNew: z.boolean(),
  notes: z.string().nullable(),
  active: z.boolean(),
  productIds: z.array(idSchema),
  /** Unpaid vendor bills raised from goods receipts. */
  outstandingPaise: paiseSchema,
  openOrders: z.number().int(),
});
export type Vendor = z.infer<typeof vendorSchema>;

export const stockLocationSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  active: z.boolean(),
});
export type StockLocation = z.infer<typeof stockLocationSchema>;

export const stockLocationInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,16}$/, 'Use 2–16 letters, digits or dashes.'),
  name: nameSchema,
  address: optional(400),
});

export const stockRowSchema = z.object({
  productId: idSchema,
  sku: z.string(),
  name: z.string(),
  brand: z.string(),
  category: z.enum(LINE_CATEGORIES),
  unit: z.string(),
  serialised: z.boolean(),
  onHand: z.number(),
  reserved: z.number(),
  available: z.number(),
  minimum: z.number().nullable(),
  low: z.boolean(),
  /** Inventory value at catalog cost. */
  valuePaise: paiseSchema,
  byLocation: z.array(
    z.object({
      locationId: idSchema,
      name: z.string(),
      onHand: z.number(),
      reserved: z.number(),
    }),
  ),
});
export type StockRow = z.infer<typeof stockRowSchema>;

export const stockAdjustmentInputSchema = z.object({
  productId: idSchema,
  locationId: idSchema,
  /** Positive adds (opening stock, found items); negative removes (damage, count). */
  quantity: quantitySchema.refine((value) => value !== 0, 'Enter a quantity other than 0.'),
  reason: z.string().trim().min(3, 'Say why the stock changes.').max(300),
  /** Serialised products: one serial per unit added or removed. */
  serials: z.array(z.string().trim().min(1).max(80)).max(2000).default([]),
});
export type StockAdjustmentInput = z.input<typeof stockAdjustmentInputSchema>;
export type StockAdjustmentData = z.output<typeof stockAdjustmentInputSchema>;

export const stockMovementSchema = z.object({
  id: idSchema,
  productName: z.string(),
  unit: z.string(),
  locationName: z.string(),
  kind: z.enum(['receipt', 'reservation', 'release', 'dispatch', 'adjustment', 'issue', 'return']),
  onHandDelta: z.number(),
  reservedDelta: z.number(),
  projectCode: z.string().nullable(),
  note: z.string().nullable(),
  by: z.string().nullable(),
  at: instantSchema,
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

export const thresholdInputSchema = z.object({
  minimum: quantitySchema.refine((value) => value >= 0, 'Use 0 or more.').nullable(),
});
export type StockLocationData = z.output<typeof stockLocationInputSchema>;

export const dispatchInputSchema = z.object({
  dispatchedOn: calendarDateSchema,
  vehicle: optional(40),
  driverName: optional(120),
  driverPhone: optionalPhone,
  notes: optional(500),
  /** The contractor whose crew takes the material at site; it is then with them. */
  contractorId: idSchema.nullable().default(null),
});
export type DispatchInput = z.input<typeof dispatchInputSchema>;
export type DispatchData = z.output<typeof dispatchInputSchema>;

export const dispatchLineSchema = z.object({
  productId: idSchema,
  name: z.string(),
  unit: z.string(),
  quantity: z.number(),
  serials: z.array(z.string()),
});

export const dispatchSchema = z.object({
  id: idSchema,
  number: z.string(),
  projectId: idSchema,
  projectCode: z.string(),
  projectName: z.string(),
  locationName: z.string(),
  dispatchedOn: calendarDateSchema,
  vehicle: z.string().nullable(),
  driverName: z.string().nullable(),
  driverPhone: z.string().nullable(),
  notes: z.string().nullable(),
  contractor: z.object({ id: idSchema, name: z.string() }).nullable(),
  lines: z.array(dispatchLineSchema),
  by: z.string().nullable(),
});
export type Dispatch = z.infer<typeof dispatchSchema>;
