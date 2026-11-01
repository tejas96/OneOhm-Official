import { z } from 'zod';
import { idSchema } from '../../common/primitives';
import { reportMetaSchema } from './business-report.schema';

/** Service requests raised and resolved, how fast, and what customers rated (PRD 3.16, 5.7). */
export const serviceReportSchema = z.object({
  meta: reportMetaSchema,
  totals: z.object({
    raised: z.number().int(),
    resolved: z.number().int(),
    openNow: z.number().int(),
    averageResolutionHours: z.number().nullable(),
    /** Resolved within two days ÷ resolved, in the period. */
    withinTwoDaysRate: z.number().nullable(),
    ratings: z.number().int(),
    averageRating: z.number().nullable(),
  }),
  byBucket: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      raised: z.number().int(),
      resolved: z.number().int(),
    }),
  ),
  byCategory: z.array(
    z.object({
      category: z.string(),
      raised: z.number().int(),
      resolved: z.number().int(),
      openNow: z.number().int(),
      averageResolutionHours: z.number().nullable(),
    }),
  ),
  byAssignee: z.array(
    z.object({
      userId: idSchema.nullable(),
      name: z.string().nullable(),
      resolved: z.number().int(),
      openNow: z.number().int(),
      averageResolutionHours: z.number().nullable(),
    }),
  ),
});
export type ServiceReport = z.infer<typeof serviceReportSchema>;
