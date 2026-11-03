import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { reportStatusSchema } from '../schemas/project.schema';

const c = initContract();

/**
 * The six statutory reports OneOhm ships with (PRD 3.18), by the key used in URLs. Each
 * DISCOM's formats live in Settings → DISCOMs, where owners add others, so a report key
 * is any short slug, not only these.
 */
export const REPORT_KEYS = [
  'model-agreement',
  'net-metering-agreement',
  'wcr',
  'dcr',
  'annexure-proforma-a',
  'meter-test-letter',
] as const;
export const reportKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,59}$/);
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
  archiveProjectReports: {
    method: 'POST',
    path: '/projects/:id/reports/archive',
    pathParams: z.object({ id: idSchema }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ saved: z.number().int(), unchanged: z.number().int() }) },
    summary:
      'Saves every ready report to the project documents; refreshes those whose data changed.',
  },
  markReportSubmitted: {
    method: 'POST',
    path: '/projects/:id/reports/:reportKey/submission',
    pathParams: z.object({ id: idSchema, reportKey: reportKeySchema }),
    body: z.object({ submitted: z.boolean() }),
    responses: { 200: z.array(reportStatusSchema) },
    summary:
      'Marks the saved report as handed in (it is then never saved again by itself), or undoes it.',
  },
  recordReportFacts: {
    method: 'PUT',
    path: '/projects/:id/report-facts',
    pathParams: z.object({ id: idSchema }),
    body: z.object({
      facts: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,60}$/), z.string().trim().max(2000)),
    }),
    responses: { 200: z.array(reportStatusSchema) },
    summary:
      'Records report details a finished task did not capture, or corrects one; audited with the old value.',
  },
  quotationPdf: {
    method: 'GET',
    path: '/quotations/:id/pdf',
    pathParams: z.object({ id: idSchema }),
    query: pdfQuery,
    responses: { 200: pdfResponse },
    summary: 'The quotation as the customer receives it: price, subsidy, effective cost.',
  },
  leadEstimatePdf: {
    method: 'GET',
    path: '/leads/:id/estimates/:estimateId/pdf',
    pathParams: z.object({ id: idSchema, estimateId: idSchema }),
    query: pdfQuery,
    responses: { 200: pdfResponse },
    summary: 'The estimate the WhatsApp bot sent a lead, for staff who may see that lead.',
  },
});
