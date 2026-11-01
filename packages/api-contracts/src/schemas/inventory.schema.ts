import { LINE_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import {
  calendarDateSchema,
  idSchema,
  instantSchema,
  nameSchema,
  paiseSchema,
  phoneSchema,
} from '../common/primitives';

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

/** An Indian mobile number, or blank. */
const optionalPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine(
    (value) => value === '' || phoneSchema.safeParse(value).success,
    'Enter a 10-digit Indian mobile number.',
  )
  .transform((value) => (value === '' ? null : value.startsWith('+91') ? value : `+91${value}`))
  .nullable();

/** Stock quantities: metres of cable can be fractional; at most 3 decimals. */
export const quantitySchema = z
  .number()
  .finite()
  .refine(
    (value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6,
    'Use up to 3 decimals.',
  );

export const vendorSchema = z.object({
  id: idSchema,
  name: z.string(),
  gstin: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  paymentTermsDays: z.number().int(),
  /** Bank details for bank transfers; the account number is shown masked only. */
  bankAccountName: z.string().nullable(),
  bankIfsc: z.string().nullable(),
  bankAccountMasked: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  productIds: z.array(idSchema),
  /** Unpaid vendor bills raised from goods receipts. */
  outstandingPaise: paiseSchema,
  openOrders: z.number().int(),
});
export type Vendor = z.infer<typeof vendorSchema>;

export const vendorInputSchema = z.object({
  name: nameSchema,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => value === '' || /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(value),
      'Enter a 15-character GSTIN.',
    )
    .transform((value) => (value === '' ? null : value))
    .nullable(),
  contactName: optional(120),
  phone: optionalPhone,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === '' || z.string().email().safeParse(value).success, {
      message: 'Enter a valid email address.',
    })
    .transform((value) => (value === '' ? null : value))
    .nullable(),
  address: optional(400),
  paymentTermsDays: z.number().int().min(0).max(180),
  bankAccountName: optional(120).optional(),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => value === '' || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value),
      'Enter an 11-character IFSC.',
    )
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
  /** Write-only: leave empty to keep the saved number. */
  bankAccountNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ''))
    .refine(
      (value) => value === '' || /^\d{9,18}$/.test(value),
      'Enter the 9 to 18 digit account number.',
    )
    .optional(),
  notes: optional(1000),
  active: z.boolean().default(true),
  productIds: z.array(idSchema).max(200).default([]),
});
export type VendorInput = z.input<typeof vendorInputSchema>;
export type VendorData = z.output<typeof vendorInputSchema>;

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
