import { EPC_STAGES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../../common/primitives';
import { reportMetaSchema, tallySchema } from './business-report.schema';

/** Tasks on time against late, systems commissioned, per project and stage (PRD 3.1, 3.8). */
export const deliveryReportSchema = z.object({
  meta: reportMetaSchema,
  totals: z.object({
    tasks: tallySchema.extend({
      openOverdue: z.number().int(),
      averageDaysLate: z.number().nullable(),
    }),
    commissioned: z.number().int(),
    commissionedWp: z.number().int(),
    averageDaysToCommission: z.number().nullable(),
    liveProjects: z.number().int(),
  }),
  byBucket: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      onTime: z.number().int(),
      late: z.number().int(),
      commissionedWp: z.number().int(),
    }),
  ),
  byProject: z.array(
    z.object({
      projectId: idSchema,
      code: z.string(),
      name: z.string(),
      manager: z.string().nullable(),
      stage: z.enum(EPC_STAGES),
      status: z.string(),
      tasks: tallySchema,
      openOverdue: z.number().int(),
      daysRunning: z.number().int(),
    }),
  ),
  byStage: z.array(
    tallySchema.extend({
      stage: z.enum(EPC_STAGES),
      averageDaysLate: z.number().nullable(),
      openOverdue: z.number().int(),
    }),
  ),
});
export type DeliveryReport = z.infer<typeof deliveryReportSchema>;
