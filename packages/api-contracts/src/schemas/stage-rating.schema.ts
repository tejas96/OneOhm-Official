import { RATED_STAGES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

export const ratedStageSchema = z.enum(RATED_STAGES);

/** Someone who worked on the stage, with the customer's stars for them if given. */
export const ratedPersonSchema = z.object({
  userId: idSchema,
  name: z.string(),
  /** The contractor crew they belong to, if any. */
  crew: z.string().nullable(),
  rating: z.number().int().nullable(),
});

/** A customer's rating of one stage and OneOhm's reply (PRD 5.7). */
export const stageRatingSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  stage: ratedStageSchema,
  rating: z.number().int(),
  comment: z.string().nullable(),
  reply: z.string().nullable(),
  repliedBy: z.string().nullable(),
  repliedAt: z.string().nullable(),
  createdAt: z.string(),
  people: z.array(ratedPersonSchema),
});
export type StageRating = z.infer<typeof stageRatingSchema>;

/** For the customer: a finished stage waiting for stars, or the rating they gave. */
export const customerStageCardSchema = z.object({
  projectId: idSchema,
  projectCode: z.string(),
  stage: ratedStageSchema,
  /** The people who did the work, to rate if they wish. */
  people: z.array(ratedPersonSchema),
  rating: stageRatingSchema.nullable(),
});
export type CustomerStageCard = z.infer<typeof customerStageCardSchema>;

export const newStageRatingSchema = z.object({
  projectId: idSchema,
  stage: ratedStageSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).nullable().optional(),
  people: z
    .array(z.object({ userId: idSchema, rating: z.number().int().min(1).max(5) }))
    .max(12)
    .default([]),
});
export type NewStageRating = z.input<typeof newStageRatingSchema>;
