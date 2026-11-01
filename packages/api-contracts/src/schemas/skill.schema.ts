import { z } from 'zod';

/** A skill the business tracks (PRD 3.7); `key` is fixed once made, the name can change. */
export const skillSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  active: z.boolean(),
  position: z.number().int(),
  /** How many active people hold it. */
  people: z.number().int(),
});
export type Skill = z.infer<typeof skillSchema>;

export const skillInputSchema = z.object({
  name: z.string().trim().min(2, 'Name the skill.').max(60),
  description: z.string().trim().max(200).default(''),
});
export type SkillInput = z.input<typeof skillInputSchema>;

export const skillUpdateSchema = skillInputSchema.partial().extend({
  active: z.boolean().optional(),
});
