import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { documentSchema } from '../schemas/document.schema';
import {
  serviceFieldWorkSchema,
  serviceFinishSchema,
  serviceJobSchema,
  serviceVisitSchema,
} from '../schemas/service-visit.schema';
import { positionSchema } from '../schemas/workforce.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const reading = z.object({ position: positionSchema.nullable().optional() });

/**
 * Service visits from the field app (PRD 5.5, 4.2): the technician's open requests,
 * checking in and out at the customer's site with the same consent and location rules
 * as task visits, evidence, and finishing or handing the work back to the desk.
 */
export const serviceVisitsContract = c.router({
  myServiceVisits: {
    method: 'GET',
    path: '/me/service-visits',
    responses: { 200: z.array(serviceJobSchema) },
    summary: 'Open service requests assigned to me, the most pressing first.',
  },
  serviceVisit: {
    method: 'GET',
    path: '/service-visits/:id',
    pathParams: idParams,
    responses: { 200: serviceVisitSchema },
  },
  serviceCheckIn: {
    method: 'POST',
    path: '/service-visits/:id/check-in',
    pathParams: idParams,
    body: reading,
    responses: { 200: serviceVisitSchema },
    summary: 'Checks in at the site; answers the request if nothing had yet.',
  },
  serviceCheckOut: {
    method: 'POST',
    path: '/service-visits/:id/check-out',
    pathParams: idParams,
    body: reading,
    responses: { 200: serviceVisitSchema },
  },
  finishServiceVisit: {
    method: 'POST',
    path: '/service-visits/:id/finish',
    pathParams: idParams,
    body: serviceFinishSchema,
    responses: { 200: serviceVisitSchema },
    summary: 'Mark the work done (resolves the request) or hand it back with a reason.',
  },
  uploadServiceFile: {
    method: 'POST',
    path: '/service-visits/:id/files',
    pathParams: idParams,
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: documentSchema },
    summary: 'A photo, short video or voice note from the visit (multipart `file`).',
  },
  serviceFieldWork: {
    method: 'GET',
    path: '/service-requests/:id/field-work',
    pathParams: idParams,
    responses: { 200: serviceFieldWorkSchema },
    summary: 'The visits, notes and evidence of one request, for the desk.',
  },
});
