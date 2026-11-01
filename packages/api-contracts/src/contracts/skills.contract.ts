import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { skillInputSchema, skillSchema, skillUpdateSchema } from '../schemas/skill.schema';

const c = initContract();

/** Skills people hold and task templates can ask for (PRD 3.7, 7.4). */
export const skillsContract = c.router({
  listSkills: {
    method: 'GET',
    path: '/skills',
    responses: { 200: z.array(skillSchema) },
  },
  createSkill: {
    method: 'POST',
    path: '/skills',
    body: skillInputSchema,
    responses: { 201: skillSchema },
  },
  updateSkill: {
    method: 'PATCH',
    path: '/skills/:key',
    pathParams: z.object({ key: z.string().min(1).max(60) }),
    body: skillUpdateSchema,
    responses: { 200: skillSchema },
  },
});
