import { OPEN_LEAD_STAGES } from '@oneohm/domain';
import { z } from 'zod';

/** A step in the owner's sales pipeline (PRD 3.3). */
export const leadStepSchema = z.object({
  key: z.string(),
  name: z.string(),
  stage: z.enum(OPEN_LEAD_STAGES),
  position: z.number().int(),
  active: z.boolean(),
  /** Open leads on this step now. */
  leads: z.number().int(),
});
export type LeadStepRecord = z.infer<typeof leadStepSchema>;

export const leadStepInputSchema = z.object({
  name: z.string().trim().min(2, 'Name the step.').max(40),
  stage: z.enum(OPEN_LEAD_STAGES),
});

export const leadStepUpdateSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  active: z.boolean().optional(),
  /** Swap with the step above or below inside the same stage. */
  move: z.enum(['up', 'down']).optional(),
});
