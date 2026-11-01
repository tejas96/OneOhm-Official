import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  changeRequestOptionsSchema,
  changeRequestTypeInputSchema,
  changeRequestTypeSettingSchema,
  reportFormatCheckSchema,
  reportFormatInputSchema,
  reportFormatSchema,
} from '../schemas/discom-setup.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const pdfResponse = c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() });

/**
 * Each DISCOM's own change requests (PRD 3.15 "configurable per DISCOM"), so owners add
 * a DISCOM's process without a developer (PRD 7.2).
 */
export const changeRequestTypesContract = c.router({
  listChangeRequestTypes: {
    method: 'GET',
    path: '/discoms/:id/change-request-types',
    pathParams: idParams,
    responses: { 200: z.array(changeRequestTypeSettingSchema) },
  },
  createChangeRequestType: {
    method: 'POST',
    path: '/discoms/:id/change-request-types',
    pathParams: idParams,
    body: changeRequestTypeInputSchema,
    responses: { 201: changeRequestTypeSettingSchema },
  },
  updateChangeRequestType: {
    method: 'PUT',
    path: '/change-request-types/:id',
    pathParams: idParams,
    body: changeRequestTypeInputSchema,
    responses: { 200: changeRequestTypeSettingSchema },
    summary: 'Open requests keep the steps they started with; new ones use the change.',
  },
  changeRequestOptions: {
    method: 'GET',
    path: '/change-request-options',
    query: z.object({
      propertyId: idSchema.optional(),
      projectId: idSchema.optional(),
      /** For a site with no DISCOM yet: the one picked in the form. */
      discomId: idSchema.optional(),
    }),
    responses: { 200: changeRequestOptionsSchema },
    summary: "The changes a site's DISCOM offers, with their fields and papers on file.",
  },
});

/** Each DISCOM's statutory report formats (PRD 3.18 "report templates are linked per DISCOM"). */
export const reportFormatsContract = c.router({
  listReportFormats: {
    method: 'GET',
    path: '/discoms/:id/report-formats',
    pathParams: idParams,
    responses: { 200: z.array(reportFormatSchema) },
  },
  createReportFormat: {
    method: 'POST',
    path: '/discoms/:id/report-formats',
    pathParams: idParams,
    body: reportFormatInputSchema,
    responses: { 201: reportFormatSchema },
  },
  updateReportFormat: {
    method: 'PUT',
    path: '/report-formats/:id',
    pathParams: idParams,
    body: reportFormatInputSchema,
    responses: { 200: reportFormatSchema },
  },
  reportFormatBody: {
    method: 'GET',
    path: '/report-formats/:id/body',
    pathParams: idParams,
    responses: { 200: z.object({ body: z.string(), builtIn: z.string().nullable() }) },
    summary: 'The template as stored, and OneOhm’s own version when there is one.',
  },
  checkReportFormat: {
    method: 'POST',
    path: '/report-formats/check',
    body: z.object({ body: z.string().max(400_000) }),
    responses: { 200: reportFormatCheckSchema },
    summary: 'Refuses unknown details (400); otherwise what it needs and a sample print.',
  },
  reportFormatSamplePdf: {
    method: 'GET',
    path: '/report-formats/:id/sample.pdf',
    pathParams: idParams,
    responses: { 200: pdfResponse },
    summary: 'The saved format printed with sample details, as a PDF.',
  },
});
