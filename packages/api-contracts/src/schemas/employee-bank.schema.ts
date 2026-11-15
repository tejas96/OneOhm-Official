import { z } from 'zod';
import { refineBank } from './bank-details.schema';

const digits = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ''));

/**
 * An employee's bank account for the money owed to them (travel claims). The same rules as
 * a vendor's or crew's: name, IFSC, the number typed twice.
 */
export const employeeBankInputSchema = z
  .object({
    bankAccountName: z.string().trim().min(1, 'Enter the name on the account.').max(120),
    bankIfsc: z.string().trim().toUpperCase(),
    bankAccountNumber: digits,
    bankAccountNumberConfirm: digits,
  })
  .superRefine((body, ctx) => refineBank(body, ctx, true));
export type EmployeeBankInput = z.input<typeof employeeBankInputSchema>;

/** What is saved, never the full number. */
export const employeeBankViewSchema = z.object({
  userId: z.string().uuid(),
  bankAccountName: z.string().nullable(),
  bankAccountMasked: z.string().nullable(),
  bankIfsc: z.string().nullable(),
  /** Bank transfers wait until this moment after a change; null when no hold. */
  holdUntil: z.string().nullable(),
});
export type EmployeeBankView = z.infer<typeof employeeBankViewSchema>;
