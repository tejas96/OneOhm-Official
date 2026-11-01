import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { reportStatusSchema } from '../schemas/project.schema';

const c = initContract();

/** The six statutory reports (PRD 3.18), by the key used in URLs. */
export const REPORT_KEYS = [
  'model-agreement',
  'net-metering-agreement',
  'wcr',
  'dcr',
  'annexure-proforma-a',
  'meter-test-letter',
] as const;
export const reportKeySchema = z.enum(REPORT_KEYS);
export type ReportKey = z.infer<typeof reportKeySchema>;

/** `inline` opens in the browser tab; `attachment` downloads. */
const pdfQuery = z.object({ disposition: z.enum(['inline', 'attachment']).default('inline') });
const pdfResponse = c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() });

/**
 * Documents made from project facts. A report that is not ready answers 409 with each
 * missing detail in `fieldErrors` (field → "label — captured by task"), never a blank PDF.
 */
export const reportOverviewSchema = z.object({
  projectId: idSchema,
  code: z.string(),
  name: z.string(),
  place: z.string(),
  status: z.enum(['active', 'operational', 'completed', 'cancelled']),
  reports: z.array(reportStatusSchema),
});
export type ReportOverview = z.infer<typeof reportOverviewSchema>;

export const reportsContract = c.router({
  reportsOverview: {
    method: 'GET',
    path: '/reports',
    responses: { 200: z.array(reportOverviewSchema) },
    summary: 'Every project that is not cancelled, with the readiness of each statutory report.',
  },
  listProjectReports: {
    method: 'GET',
    path: '/projects/:id/reports',
    pathParams: z.object({ id: idSchema }),
    responses: { 200: z.array(reportStatusSchema) },
    summary: 'Ready, missing (with what is missing) or not needed, for each statutory report.',
  },
  projectReportPdf: {
    method: 'GET',
    path: '/projects/:id/reports/:reportKey/pdf',
    pathParams: z.object({ id: idSchema, reportKey: reportKeySchema }),
    query: pdfQuery,
    responses: { 200: pdfResponse },
    summary: 'The statutory report as a PDF, signed and stamped.',
  },
  quotationPdf: {
    method: 'GET',
    path: '/quotations/:id/pdf',
    pathParams: z.object({ id: idSchema }),
    query: pdfQuery,
    responses: { 200: pdfResponse },
    summary: 'The quotation as the customer receives it: price, subsidy, effective cost.',
  },
});
