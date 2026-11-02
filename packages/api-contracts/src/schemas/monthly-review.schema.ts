import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';

/** An India month, `YYYY-MM`. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month.');

/** A share of the judged tasks, 0–1; null when nothing was judged. */
const rate = z.number().min(0).max(1).nullable();

export const monthlyRowSchema = z.object({
  user: userRefSchema,
  points: z.number().int(),
  previousPoints: z.number().int(),
  tasksJudged: z.number().int(),
  onTimeRate: rate,
  firstTimeRate: rate,
  /** Average stars from stage ratings that named them this month. */
  ratingAverage: z.number().nullable(),
  review: z
    .object({
      decision: z.enum(['none', 'bonus']),
      bonusId: idSchema.nullable(),
      amountPaise: z.number().int().nullable(),
      /** The bonus approval: pending, approved, rejected or cancelled. */
      status: z.string().nullable(),
      note: z.string().nullable(),
    })
    .nullable(),
});
export type MonthlyRow = z.infer<typeof monthlyRowSchema>;

export const monthlyReviewSchema = z.object({
  month: monthSchema,
  /** Rates count only lines from this moment, when the fair points rules started. */
  fairSince: instantSchema.nullable(),
  rows: z.array(monthlyRowSchema),
});
export type MonthlyReview = z.infer<typeof monthlyReviewSchema>;

/** One person's month, by project, every point line with its reason. */
export const monthlyPersonSchema = z.object({
  month: monthSchema,
  user: userRefSchema,
  projects: z.array(
    z.object({
      projectId: idSchema.nullable(),
      code: z.string(),
      name: z.string(),
      lines: z.array(
        z.object({
          id: idSchema,
          sourceType: z.string(),
          points: z.number().int(),
          reason: z.string(),
          createdAt: instantSchema,
        }),
      ),
    }),
  ),
});
export type MonthlyPerson = z.infer<typeof monthlyPersonSchema>;

export const decideMonthInputSchema = z
  .object({
    month: monthSchema,
    decision: z.enum(['none', 'bonus']),
    amountPaise: z.number().int().positive('Enter an amount.').optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((input) => input.decision !== 'bonus' || input.amountPaise !== undefined, {
    message: 'Enter an amount.',
    path: ['amountPaise'],
  });
export type DecideMonthInput = z.infer<typeof decideMonthInputSchema>;

/** This month for the person themself (My rewards). */
export const myMonthSchema = z.object({
  month: monthSchema,
  points: z.number().int(),
  tasksJudged: z.number().int(),
  onTimeRate: rate,
  firstTimeRate: rate,
  missed: z.array(z.object({ reason: z.string(), createdAt: instantSchema })),
});
