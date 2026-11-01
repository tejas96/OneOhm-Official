import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  customerStageCardSchema,
  newStageRatingSchema,
  stageRatingSchema,
} from '../schemas/stage-rating.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** The customer rates each finished stage, and the people who did it (PRD 5.7). */
export const customerStageRatingsContract = c.router({
  myStageRatings: {
    method: 'GET',
    path: '/customer/stage-ratings',
    responses: { 200: z.array(customerStageCardSchema) },
    summary: 'Finished stages to rate, and ratings already given with any reply.',
  },
  rateStage: {
    method: 'POST',
    path: '/customer/stage-ratings',
    body: newStageRatingSchema,
    responses: { 201: customerStageCardSchema },
  },
});

/** Staff read a project's stage ratings and reply to them. */
export const stageRatingsContract = c.router({
  projectStageRatings: {
    method: 'GET',
    path: '/projects/:id/stage-ratings',
    pathParams: idParams,
    responses: { 200: z.array(stageRatingSchema) },
  },
  replyToStageRating: {
    method: 'POST',
    path: '/stage-ratings/:id/reply',
    pathParams: idParams,
    body: z.object({ reply: z.string().trim().min(2).max(1000) }),
    responses: { 200: stageRatingSchema },
  },
});
