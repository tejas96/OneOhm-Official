import { z } from 'zod';
import { phoneSchema } from '../common/primitives';

export const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

/** An Indian mobile number, or blank. */
export const optionalPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine(
    (value) => value === '' || phoneSchema.safeParse(value).success,
    'Enter a 10-digit Indian mobile number.',
  )
  .transform((value) => (value === '' ? null : value.startsWith('+91') ? value : `+91${value}`))
  .nullable();
