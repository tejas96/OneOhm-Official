import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { calendarDateSchema, idSchema, noteSchema } from '../common/primitives';
import {
  changeRequestDetailSchema,
  changeRequestNoticesSchema,
  changeRequestStatusSchema,
  changeRequestSuggestionSchema,
  changeRequestSummarySchema,
  changeRequestTypeSchema,
  discomDeskSchema,
} from '../schemas/discom.schema';
import { waitingPartySchema } from '../schemas/project.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const stepParams = z.object({ id: idSchema, stepId: idSchema });
const reference = z.string().trim().max(80).nullable().optional();

/** The DISCOM desk and utility change requests (PRD 3.15, 3.16). */
export const discomContract = c.router({
  discomDesk: {
    method: 'GET',
    path: '/discom/desk',
    responses: { 200: discomDeskSchema },
  },
  updateFollowUp: {
    method: 'PUT',
    path: '/discom/follow-ups/:taskId',
    pathParams: z.object({ taskId: idSchema }),
    body: z.object({
      referenceNumber: reference,
      office: z.string().trim().max(120).nullable().optional(),
      nextFollowUpOn: calendarDateSchema.nullable().optional(),
      note: noteSchema.nullable().optional(),
    }),
    responses: { 200: z.object({ taskId: idSchema }) },
  },
  listChangeRequests: {
    method: 'GET',
    path: '/change-requests',
    query: z.object({
      status: changeRequestStatusSchema.optional(),
      customerId: idSchema.optional(),
      propertyId: idSchema.optional(),
      projectId: idSchema.optional(),
    }),
    responses: { 200: z.array(changeRequestSummarySchema) },
  },
  createChangeRequest: {
    method: 'POST',
    path: '/change-requests',
    body: z
      .object({
        type: changeRequestTypeSchema,
        /** The site; may be left out when a project is given (its site is used). */
        propertyId: idSchema.optional(),
        projectId: idSchema.nullable().optional(),
        /** For a site with no DISCOM yet: the one it is with (saved on the site). */
        discomId: idSchema.optional(),
        values: z.record(z.string(), z.string().trim().max(200)).default({}),
        note: noteSchema.nullable().optional(),
      })
      .refine((body) => body.propertyId || body.projectId, {
        message: 'Pick the site.',
        path: ['propertyId'],
      }),
    responses: { 201: changeRequestDetailSchema },
  },
  getChangeRequest: {
    method: 'GET',
    path: '/change-requests/:id',
    pathParams: idParams,
    responses: { 200: changeRequestDetailSchema },
  },
  changeRequestSuggestions: {
    method: 'GET',
    path: '/properties/:id/change-request-suggestions',
    pathParams: idParams,
    responses: { 200: z.array(changeRequestSuggestionSchema) },
  },
  changeRequestNotices: {
    method: 'GET',
    path: '/change-request-notices',
    query: z
      .object({
        propertyId: idSchema.optional(),
        projectId: idSchema.optional(),
        quotationId: idSchema.optional(),
      })
      .refine((query) => query.propertyId || query.projectId || query.quotationId, {
        message: 'Pick a site, project or quotation.',
      }),
    responses: { 200: changeRequestNoticesSchema },
    summary: 'Change requests a mismatch suggests, and whether a quotation needs re-pricing.',
  },
  startChangeRequestStep: {
    method: 'POST',
    path: '/change-requests/:id/steps/:stepId/start',
    pathParams: stepParams,
    body: c.noBody(),
    responses: { 200: changeRequestDetailSchema },
  },
  waitChangeRequestStep: {
    method: 'POST',
    path: '/change-requests/:id/steps/:stepId/waiting',
    pathParams: stepParams,
    body: z.object({
      party: waitingPartySchema,
      referenceNumber: reference,
      nextFollowUpOn: calendarDateSchema.nullable().optional(),
      note: noteSchema.nullable().optional(),
    }),
    responses: { 200: changeRequestDetailSchema },
  },
  completeChangeRequestStep: {
    method: 'POST',
    path: '/change-requests/:id/steps/:stepId/complete',
    pathParams: stepParams,
    body: z.object({
      facts: z.record(z.string(), z.string().trim().max(200)).default({}),
      note: noteSchema.nullable().optional(),
    }),
    responses: { 200: changeRequestDetailSchema },
    summary: 'The last step applies the change to the property and tells the customer.',
  },
  cancelChangeRequest: {
    method: 'POST',
    path: '/change-requests/:id/cancel',
    pathParams: idParams,
    body: z.object({ reason: z.string().trim().min(3).max(500) }),
    responses: { 200: changeRequestDetailSchema },
  },
});
