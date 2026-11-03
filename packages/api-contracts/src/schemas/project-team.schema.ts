import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';

/** The project's contractor, named team and target finish (PRD 3.8, Flow H). */
export const projectSetupSchema = z.object({
  /** The one crew company all crew work goes to. */
  contractor: z.object({ id: idSchema, name: z.string(), active: z.boolean() }).nullable(),
  /** Staff named for the project; empty means anyone in the company. */
  team: z.array(userRefSchema),
  targetFinishDate: calendarDateSchema.nullable(),
  /** The survey is approved but the budget is still not locked: a manager can recheck. */
  canRecheckBudget: z.boolean(),
  /** The survey has been sent in, so its report can be printed. */
  surveyReport: z.boolean(),
});
export type ProjectSetup = z.infer<typeof projectSetupSchema>;

/** Who can be picked when a project is created or its team changes. */
export const teamOptionsSchema = z.object({
  /** Staff with the names of their roles, for picking a team. */
  people: z.array(
    z.object({
      id: idSchema,
      fullName: z.string(),
      roles: z.array(z.string()),
      /** Can see every project, so can be its manager. */
      canManage: z.boolean(),
    }),
  ),
  contractors: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      active: z.boolean(),
      crew: z.number().int(),
      lead: z.string().nullable(),
      serviceAreas: z.array(z.string()),
    }),
  ),
});
export type TeamOptions = z.infer<typeof teamOptionsSchema>;

/** A later change to the project's manager, team or target finish. */
export const projectUpdateSchema = z.object({
  managerUserId: idSchema.optional(),
  teamUserIds: z.array(idSchema).max(30).optional(),
  targetFinishDate: calendarDateSchema.nullable().optional(),
});
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

const days = z.number().int().min(1).max(90);

/** When late or stuck work is raised (PRD 3.7, 7.2). */
export const escalationPolicySchema = z.object({
  managerAfterDays: days,
  ownersAfterDays: days,
  stuckInternalDays: days,
  stuckOutsideDays: days,
});
export type EscalationPolicyRecord = z.infer<typeof escalationPolicySchema>;
