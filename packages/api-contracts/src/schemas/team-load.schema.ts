import { z } from 'zod';
import { idSchema } from '../common/primitives';

const loadFields = {
  open: z.number().int(),
  overdue: z.number().int(),
  dueToday: z.number().int(),
  /** Finished in the chosen period. */
  done: z.number().int(),
  /** Share of the period's finished tasks done by their due date; null when none. */
  onTimePercent: z.number().int().nullable(),
  /** Customers' stars for their stage work (PRD 5.7); null until enough ratings. */
  rating: z.number().nullable(),
  ratings: z.number().int(),
};

/** Who carries the work, and who is falling behind (PRD 3.1 drill-down). */
export const teamLoadSchema = z.object({
  people: z.array(
    z.object({
      userId: idSchema,
      name: z.string(),
      /**
       * Department for the drill-down. OneOhm has no department field, so this is the
       * person's main role (the first one given to them), e.g. "Sales" or "Execution".
       */
      department: z.string().nullable(),
      onLeaveToday: z.boolean(),
      ...loadFields,
    }),
  ),
  /** People grouped by department (their main role); `department` null for no role. */
  departments: z.array(
    z.object({ department: z.string().nullable(), people: z.number().int(), ...loadFields }),
  ),
  contractors: z.array(
    z.object({ contractorId: idSchema, name: z.string(), crew: z.number().int(), ...loadFields }),
  ),
});
export type TeamLoad = z.infer<typeof teamLoadSchema>;
