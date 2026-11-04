import { z } from 'zod';

/** The GST slabs a product or rate can carry, in basis points (500 = 5%). 40% is GST 2.0's. */
export const GST_RATES_BP = [0, 500, 1_200, 1_800, 2_800, 4_000] as const;

export const gstRateSchema = z
  .number()
  .int()
  .refine((bp) => (GST_RATES_BP as readonly number[]).includes(bp), {
    message: 'Use a GST rate: 0, 5, 12, 18, 28 or 40%.',
  });
