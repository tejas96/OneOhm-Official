import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../common/primitives';

/** Material shortages and procurement risks (PRD 3.1), each row a way into its records. */
export const materialRisksSchema = z.object({
  /** Free stock across the stores below the item's reorder level. */
  belowReorder: z.array(
    z.object({
      productId: idSchema,
      name: z.string(),
      unit: z.string(),
      free: z.number(),
      minimum: z.number(),
    }),
  ),
  /** Sent orders past their expected date with goods still to come. */
  latePurchaseOrders: z.array(
    z.object({
      id: idSchema,
      number: z.string(),
      vendorName: z.string(),
      expectedOn: calendarDateSchema,
      daysLate: z.number().int(),
      projectCode: z.string().nullable(),
    }),
  ),
  /** Live projects with material or installation work due within two weeks that are short. */
  shortProjects: z.array(
    z.object({
      projectId: idSchema,
      projectCode: z.string(),
      projectName: z.string(),
      items: z.array(z.object({ name: z.string(), unit: z.string(), short: z.number() })),
    }),
  ),
  /** How many there are in all; the lists above show the first few. */
  counts: z.object({
    belowReorder: z.number().int(),
    latePurchaseOrders: z.number().int(),
    shortProjects: z.number().int(),
  }),
});
export type MaterialRisks = z.infer<typeof materialRisksSchema>;

/** Projects by state, so every state on the dashboard opens the projects in it (PRD 3.1). */
export const projectStatesSchema = z.object({
  onTrack: z.number().int(),
  atRisk: z.number().int(),
  waiting: z.number().int(),
  blocked: z.number().int(),
  overdue: z.number().int(),
  /** Work finished in the period. */
  completed: z.number().int(),
  /** Of those, still with money to collect. */
  completedUnpaid: z.number().int(),
});
export type ProjectStates = z.infer<typeof projectStatesSchema>;

/** Live projects by the month they are expected to finish (`deliveryForecast`). */
export const deliveryOutlookSchema = z.object({
  thisMonth: z.number().int(),
  nextMonth: z.number().int(),
  later: z.number().int(),
  /** Expected later than planned because work runs behind. */
  behindPlan: z.number().int(),
  /** Days behind plan, averaged over the projects that run behind; 0 when none. */
  averageSlipDays: z.number().int(),
});
export type DeliveryOutlook = z.infer<typeof deliveryOutlookSchema>;
