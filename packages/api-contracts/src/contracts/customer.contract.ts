import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema, phoneSchema } from '../common/primitives';
import {
  customerDocumentSchema,
  customerHomeSchema,
  customerProfileSchema,
  customerReportSchema,
  feedbackInputSchema,
  referralInputSchema,
  referralSchema,
  serviceRequestInputSchema,
  serviceRequestSchema,
} from '../schemas/customer-portal.schema';
import { reportKeySchema } from './reports.contract';

const c = initContract();
const pdfResponse = c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() });

/**
 * The customer app. Customers sign in with a one-time code to their registered mobile
 * and see only their own homes, payments, documents and requests (bearer token).
 */
export const customerContract = c.router({
  requestCode: {
    method: 'POST',
    path: '/customer/auth/otp',
    body: z.object({ phone: phoneSchema }),
    responses: { 202: z.object({ expiresInSeconds: z.number().int() }) },
    summary: 'Texts a code when the number belongs to a customer; the same answer otherwise.',
  },
  verifyCode: {
    method: 'POST',
    path: '/customer/auth/otp/verify',
    body: z.object({
      phone: phoneSchema,
      code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
    }),
    responses: { 200: z.object({ token: z.string(), customer: customerProfileSchema }) },
  },
  signOut: {
    method: 'POST',
    path: '/customer/auth/sign-out',
    body: c.noBody(),
    responses: { 204: c.noBody() },
  },
  home: {
    method: 'GET',
    path: '/customer/home',
    responses: { 200: customerHomeSchema },
    summary: 'Profile plus every project with its journey, payments and subsidy status.',
  },
  quotationPdf: {
    method: 'GET',
    path: '/customer/quotations/:id/pdf',
    pathParams: z.object({ id: idSchema }),
    responses: { 200: pdfResponse },
  },
  listDocuments: {
    method: 'GET',
    path: '/customer/documents',
    responses: { 200: z.array(customerDocumentSchema) },
    summary: 'Customer-facing files on the customer and their projects; never internal evidence.',
  },
  documentFile: {
    method: 'GET',
    path: '/customer/documents/:id/file',
    pathParams: z.object({ id: idSchema }),
    responses: {
      200: c.otherResponse({ contentType: 'application/octet-stream', body: c.type<Blob>() }),
    },
  },
  listReports: {
    method: 'GET',
    path: '/customer/reports',
    responses: { 200: z.array(customerReportSchema) },
    summary: "The statutory reports that are ready on the customer's projects.",
  },
  reportPdf: {
    method: 'GET',
    path: '/customer/projects/:id/reports/:reportKey/pdf',
    pathParams: z.object({ id: idSchema, reportKey: reportKeySchema }),
    responses: { 200: pdfResponse },
  },
  listReferrals: {
    method: 'GET',
    path: '/customer/referrals',
    responses: { 200: z.array(referralSchema) },
  },
  createReferral: {
    method: 'POST',
    path: '/customer/referrals',
    body: referralInputSchema,
    responses: { 201: referralSchema },
    summary: 'Creates a lead (source referral) linked to the referring customer.',
  },
  listServiceRequests: {
    method: 'GET',
    path: '/customer/service-requests',
    responses: { 200: z.array(serviceRequestSchema) },
  },
  createServiceRequest: {
    method: 'POST',
    path: '/customer/service-requests',
    body: serviceRequestInputSchema,
    responses: { 201: serviceRequestSchema },
  },
  addServiceRequestPhoto: {
    method: 'POST',
    path: '/customer/service-requests/:id/photos',
    pathParams: z.object({ id: idSchema }),
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: serviceRequestSchema },
    summary: 'One photo of the problem (field "file"), added to the customer’s own request.',
  },
  giveFeedback: {
    method: 'POST',
    path: '/customer/feedback',
    body: feedbackInputSchema,
    responses: { 204: c.noBody() },
  },
});
