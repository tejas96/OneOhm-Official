import { z } from 'zod';
import { idSchema, paiseSchema } from '../../common/primitives';
import { reportMetaSchema } from './business-report.schema';

const rate = z.number().nullable();

/**
 * Cost so far from each source: stock sent to site or handed to the contractor (less what
 * came back), vendor bills, contractor bills, and employees' travel claimed for the project.
 */
const actualCostSchema = z.object({
  stockPaise: paiseSchema,
  vendorPaise: paiseSchema,
  contractorPaise: paiseSchema,
  travelPaise: paiseSchema,
});

/**
 * Are we making the margin we quoted (PRD 3.9, Flow F)? The estimate is the accepted
 * quotation (price without GST, its cost and margin); the actual is what has been spent
 * so far, so a project still in progress shows an incomplete cost.
 */
export const profitabilityReportSchema = z.object({
  meta: reportMetaSchema,
  totals: z.object({
    projects: z.number().int(),
    completed: z.number().int(),
    contractPaise: paiseSchema,
    estimatedCostPaise: paiseSchema,
    estimatedMarginRate: rate,
    actualCostPaise: paiseSchema,
    /** Actual so far ÷ estimated cost. */
    costUsedRate: rate,
    marginSoFarRate: rate,
    overBudget: z.number().int(),
  }),
  /** The estimate by kind of line, the actual by where the cost came from. */
  cost: z.object({
    estimate: z.object({
      materialPaise: paiseSchema,
      installationPaise: paiseSchema,
      otherPaise: paiseSchema,
    }),
    actual: actualCostSchema,
    /** Vendor and contractor bills by where they stand. */
    bills: z.object({
      pendingPaise: paiseSchema,
      approvedPaise: paiseSchema,
      paidPaise: paiseSchema,
    }),
  }),
  /** Projects by the week or month they started. */
  byBucket: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      projects: z.number().int(),
      contractPaise: paiseSchema,
      estimatedCostPaise: paiseSchema,
      actualCostPaise: paiseSchema,
    }),
  ),
  /** Lowest margin so far first. */
  byProject: z.array(
    z.object({
      projectId: idSchema,
      code: z.string(),
      customerName: z.string(),
      startDate: z.string(),
      status: z.enum(['in_progress', 'completed']),
      contractPaise: paiseSchema,
      estimatedCostPaise: paiseSchema,
      estimatedMarginRate: rate,
      actual: actualCostSchema,
      actualCostPaise: paiseSchema,
      /** Actual − estimated: above zero is over budget. */
      variancePaise: paiseSchema,
      marginSoFarRate: rate,
    }),
  ),
});
export type ProfitabilityReport = z.infer<typeof profitabilityReportSchema>;
