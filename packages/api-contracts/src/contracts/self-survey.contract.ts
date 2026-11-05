import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  askSurveyAgainSchema,
  selfSurveyQuerySchema,
  selfSurveyViewSchema,
} from '../schemas/self-survey.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const empty = z.object({}).optional();

/** The engineer's check of a self site survey (redesign §7): read it, ask for one item again, or book a visit. */
export const selfSurveyContract = c.router({
  selfSurvey: {
    method: 'GET',
    path: '/self-surveys',
    query: selfSurveyQuerySchema,
    responses: { 200: selfSurveyViewSchema.nullable() },
    summary: 'The self survey of a survey step, or null when none was offered.',
  },
  askSurveyAgain: {
    method: 'POST',
    path: '/self-surveys/:id/ask-again',
    pathParams: idParams,
    body: askSurveyAgainSchema,
    responses: { 200: selfSurveyViewSchema },
    summary: 'Asks the customer for only these items again.',
  },
  surveyVisitInstead: {
    method: 'POST',
    path: '/self-surveys/:id/visit',
    pathParams: idParams,
    body: empty,
    responses: { 200: selfSurveyViewSchema },
    summary: 'Turns the survey into a visit pick (no discount).',
  },
});
