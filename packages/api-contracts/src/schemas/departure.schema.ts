import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { capabilitySchema } from './identity.schema';

/** Money still owed for one kind of item: how many, and the total in paise. */
const owedSchema = z.object({ count: z.number().int(), paise: z.number().int() });

/**
 * What an admin sees before removing someone (spec Flow 5): counts of what they still
 * hold open, what the company still owes them, key permissions only they hold, and the
 * person their work would go to by default.
 */
export const departureSchema = z.object({
  counts: z.object({
    leads: z.number().int(),
    tasks: z.number().int(),
    proposedTasks: z.number().int(),
    serviceRequests: z.number().int(),
    discomSteps: z.number().int(),
    managedProjects: z.number().int(),
    teamProjects: z.number().int(),
    directReports: z.number().int(),
    chats: z.number().int(),
    leaveApprovals: z.number().int(),
    backupFor: z.number().int(),
    ownPendingLeave: z.number().int(),
    commissionRules: z.number().int(),
  }),
  settlement: z.object({
    travelClaims: owedSchema,
    bonusShares: owedSchema,
    payables: owedSchema,
    commissions: owedSchema,
    pendingPoints: z.number().int(),
  }),
  soleHolderOf: z.array(capabilitySchema),
  suggestedTargetId: idSchema.nullable(),
});
export type Departure = z.infer<typeof departureSchema>;
