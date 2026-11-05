import { z } from 'zod';
import { idSchema, nameSchema } from '../common/primitives';
import { refineBank } from './bank-details.schema';
import { optional, optionalPhone } from './optional-fields';

const vendorBase = z.object({
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
  /** Optional; with a GSTIN and no PAN, TDS reads the PAN out of the GSTIN. */
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || /^[A-Z]{5}\d{4}[A-Z]$/.test(value), 'Enter a valid PAN.')
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
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
  bankIfsc: z.string().trim().toUpperCase().nullable().optional(),
  /** Write-only: leave empty to keep the saved number. */
  bankAccountNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ''))
    .optional(),
  /** The number typed a second time; needed only when a new number is sent. */
  bankAccountNumberConfirm: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ''))
    .optional(),
  notes: optional(1000),
  active: z.boolean().default(true),
  productIds: z.array(idSchema).max(200).default([]),
});

/** A blank IFSC means none. */
const blankIfscToNull = <T extends { bankIfsc?: string | null | undefined }>(body: T): T =>
  body.bankIfsc === '' ? { ...body, bankIfsc: null } : body;

export const vendorInputSchema = vendorBase
  .superRefine((body, ctx) => refineBank(body, ctx, true))
  .transform(blankIfscToNull);

/** An edit: only the keys sent. The saved account name is checked by the service. */
export const vendorPatchSchema = vendorBase
  .partial()
  .superRefine((body, ctx) => refineBank(body, ctx, false))
  .transform(blankIfscToNull);

export type VendorInput = z.input<typeof vendorInputSchema>;
export type VendorData = z.output<typeof vendorInputSchema>;
export type VendorPatchData = z.output<typeof vendorPatchSchema>;
