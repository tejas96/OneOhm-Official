import { z } from 'zod';
import { calendarDateSchema, idSchema, paiseSchema } from '../common/primitives';
import { subsidyRuleStateSchema } from './subsidy-rule.schema';

/**
 * A version of the state's low-income top-up (PRD 3.5: "No general top-up; separate scheme
 * for low-income households only"), next to the PM Surya Ghar rules in Settings.
 */
export const stateSubsidyRuleSchema = z.object({
  id: idSchema,
  state: z.string(),
  validFrom: calendarDateSchema,
  paisePerKw: paiseSchema,
  capPaise: paiseSchema,
});

/** With where it stands today: history, the one in force, or one that starts later. */
export const stateSubsidyVersionSchema = stateSubsidyRuleSchema.extend({
  status: subsidyRuleStateSchema,
});
export type StateSubsidyVersion = z.infer<typeof stateSubsidyVersionSchema>;

/** A new version (or a change to one not yet in force), as Settings sends it. */
export const stateSubsidyInputSchema = z.object({
  validFrom: calendarDateSchema,
  paisePerKw: paiseSchema.positive('Enter an amount per kW above ₹0.'),
  capPaise: paiseSchema.positive('Set the most a household can get.'),
});
export type StateSubsidyInput = z.infer<typeof stateSubsidyInputSchema>;
