import { consumerNumberProblem, normalizeConsumerNumber, UNITS } from '@oneohm/domain';
import { z } from 'zod';

export const idSchema = z.string().uuid();
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-02.');
export const instantSchema = z.string().datetime({ offset: true });
/** Money is integer paise. */
export const paiseSchema = z.number().int();
export const wattsSchema = z.number().int().nonnegative();
/** Indian mobile numbers; stored as E.164 (+91…). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => /^(\+91)?[6-9]\d{9}$/.test(value), 'Enter a 10-digit Indian mobile number.')
  .transform((value) => (value.startsWith('+91') ? value : `+91${value}`));
/** The bill's consumer number; stored without spaces or dashes, in capitals. */
export const consumerNumberSchema = z
  .string()
  .max(40, 'Use the consumer number from the bill: 6 to 20 letters or digits.')
  .transform(normalizeConsumerNumber)
  .superRefine((value, ctx) => {
    const problem = consumerNumberProblem(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });
export const nameSchema = z.string().trim().min(2, 'Use at least 2 characters.').max(160);
export const noteSchema = z.string().trim().max(2000);
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');

/** A unit from the fixed list (nos, m, set…); never free text. */
export const unitSchema = z.enum(UNITS, {
  errorMap: () => ({ message: 'Pick a unit from the list.' }),
});
