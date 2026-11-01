import { z } from 'zod';
import { idSchema, paiseSchema } from '../../common/primitives';
import { ageingBucketSchema, moneyInMethodSchema } from '../finance.schema';
import { reportMetaSchema } from './business-report.schema';

/**
 * Money in, money still owed and how old it is (PRD 3.1, 3.11). "Collected" is new money:
 * payments net of reversals and refunds, plus overpayments held as credit, less credit
 * refunded; a payment applied from credit is not counted again.
 */
export const collectionsReportSchema = z.object({
  meta: reportMetaSchema,
  totals: z.object({
    collectedPaise: paiseSchema,
    collectedCustomerPaise: paiseSchema,
    collectedBankPaise: paiseSchema,
    /** Money in before reversals and refunds, and what went back out. */
    receivedPaise: paiseSchema,
    returnedPaise: paiseSchema,
    /** Today: unpaid on milestones that have fallen due, by payer. */
    owedCustomerPaise: paiseSchema,
    owedBankPaise: paiseSchema,
    /** Today: unpaid on milestones whose event has not happened yet. */
    notDueYetPaise: paiseSchema,
    /** Today: unpaid on milestones whose due date is before today. */
    overduePaise: paiseSchema,
    overdueCount: z.number().int(),
    oldestOverdueDays: z.number().int().nullable(),
    /** Milestones that fell due in the period, and how much of them is paid by now. */
    fellDuePaise: paiseSchema,
    fellDuePaidPaise: paiseSchema,
    collectionRate: z.number().nullable(),
  }),
  byBucket: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      customerPaise: paiseSchema,
      bankPaise: paiseSchema,
    }),
  ),
  /** Live projects with anything left to collect, oldest overdue first. */
  byProject: z.array(
    z.object({
      projectId: idSchema,
      code: z.string(),
      customerName: z.string(),
      /** The accepted quotation's price with GST. */
      contractPaise: paiseSchema,
      paidPaise: paiseSchema,
      owedPaise: paiseSchema,
      notDueYetPaise: paiseSchema,
      overduePaise: paiseSchema,
      oldestOverdueDays: z.number().int().nullable(),
    }),
  ),
  /** What has fallen due and is unpaid today, by days since it fell due. */
  ageing: z.array(
    z.object({
      bucket: ageingBucketSchema,
      customerPaise: paiseSchema,
      bankPaise: paiseSchema,
      milestones: z.number().int(),
    }),
  ),
  byMethod: z.array(
    z.object({
      method: moneyInMethodSchema,
      receivedPaise: paiseSchema,
      returnedPaise: paiseSchema,
      netPaise: paiseSchema,
    }),
  ),
});
export type CollectionsReport = z.infer<typeof collectionsReportSchema>;
