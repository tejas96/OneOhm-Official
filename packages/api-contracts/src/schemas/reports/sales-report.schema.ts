import { LEAD_SOURCES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, paiseSchema } from '../../common/primitives';
import { reportMetaSchema } from './business-report.schema';

const rate = z.number().nullable();

/** Leads in, quotations out, orders won (PRD 3.1, 3.3): the sales pipeline and conversion. */
export const salesReportSchema = z.object({
  meta: reportMetaSchema,
  totals: z.object({
    leads: z.number().int(),
    quotesSent: z.number().int(),
    quotesSentWp: z.number().int(),
    won: z.number().int(),
    wonPaise: paiseSchema,
    wonWp: z.number().int(),
    lost: z.number().int(),
    /** Leads created in the period that have been won by now. */
    leadToWonRate: rate,
    /** Quotations accepted ÷ accepted or rejected, decided in the period. */
    quoteWinRate: rate,
    averageDaysToWin: z.number().nullable(),
    averageOrderPaise: paiseSchema.nullable(),
  }),
  byBucket: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      leads: z.number().int(),
      won: z.number().int(),
      wonPaise: paiseSchema,
    }),
  ),
  /** Of the leads created in the period: how many were quoted, won and became projects. */
  funnel: z.object({
    leads: z.number().int(),
    quoted: z.number().int(),
    won: z.number().int(),
    projects: z.number().int(),
  }),
  bySource: z.array(
    z.object({
      source: z.enum(LEAD_SOURCES),
      leads: z.number().int(),
      won: z.number().int(),
      wonPaise: paiseSchema,
      rate,
    }),
  ),
  /** Of the leads created in the period, by the ad or campaign that brought them. */
  byCampaign: z.array(
    z.object({
      /** The campaign code, else `ad:<id>`, else `utm:<campaign>`, else `none`. */
      key: z.string(),
      label: z.string(),
      leads: z.number().int(),
      /** Leads that got an instant estimate on WhatsApp. */
      estimates: z.number().int(),
      /** Leads that reached quotation sent or later. */
      quoted: z.number().int(),
      won: z.number().int(),
      /** Leads whose project has its first customer milestone (the advance) paid. */
      advancePaid: z.number().int(),
      wonValuePaise: paiseSchema,
      /** Customer payments on the projects these leads' quotations became. */
      collectedPaise: paiseSchema,
    }),
  ),
  byOwner: z.array(
    z.object({
      userId: idSchema.nullable(),
      name: z.string().nullable(),
      leads: z.number().int(),
      quotesSent: z.number().int(),
      /** Orders won in the period. */
      won: z.number().int(),
      wonPaise: paiseSchema,
      /** Of this person's leads from the period, how many are won by now. */
      leadsWon: z.number().int(),
      rate,
    }),
  ),
  lostReasons: z.array(z.object({ reason: z.string(), count: z.number().int() })),
});
export type SalesReport = z.infer<typeof salesReportSchema>;
