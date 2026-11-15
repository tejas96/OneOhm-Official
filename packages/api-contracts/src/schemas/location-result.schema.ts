import { z } from 'zod';

/**
 * What happened to the phone's location at a check-in or check-out (live review A5). Only
 * the check-in and check-out answers carry it. `reason` says why a reading was not kept:
 * `no_reading` (the phone sent none), or the tracking state that stopped it. `fence` is
 * where the reading stood against the places: null when none was kept or no place is set up.
 */
export const locationResultSchema = z.object({
  saved: z.boolean(),
  reason: z.enum(['no_reading', 'no_consent', 'policy_off', 'outside_hours']).nullable(),
  fence: z.enum(['inside', 'outside', 'unsure']).nullable(),
});
export type LocationResult = z.infer<typeof locationResultSchema>;
