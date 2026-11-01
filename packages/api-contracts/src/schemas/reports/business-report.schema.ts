import { z } from 'zod';
import { calendarDateSchema } from '../../common/primitives';
import { commandCenterQuerySchema } from '../dashboard.schema';

/** The business reports, one tab each (PRD 3.1: every metric opens its records). */
export const BUSINESS_REPORTS = [
  'sales',
  'delivery',
  'delays',
  'collections',
  'profitability',
  'team',
  'service',
] as const;
export type BusinessReportName = (typeof BUSINESS_REPORTS)[number];

/** The same filters as the command centre: period, project manager and project type. */
export const businessReportQuerySchema = commandCenterQuerySchema;
export type BusinessReportQuery = z.input<typeof businessReportQuerySchema>;

export const reportBucketSchema = z.object({ start: calendarDateSchema, end: calendarDateSchema });

/** What every report says about itself: the days it counted, cut into weeks or months. */
export const reportMetaSchema = z.object({
  range: reportBucketSchema,
  granularity: z.enum(['week', 'month']),
  buckets: z.array(reportBucketSchema),
});
export type ReportMeta = z.infer<typeof reportMetaSchema>;

/** Finished on time against late; the rate is null when nothing finished. */
export const tallySchema = z.object({
  onTime: z.number().int(),
  late: z.number().int(),
  onTimeRate: z.number().nullable(),
});
export type Tally = z.infer<typeof tallySchema>;

/** The CSV a report downloads as, in the same URL with `/csv` added. */
export const businessReportCsvPath = (name: BusinessReportName) =>
  `/v1/business-reports/${name}/csv`;
