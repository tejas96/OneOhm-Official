import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  companyAssetKindSchema,
  companyAssetsSchema,
  documentFilterSchema,
  documentSchema,
  moveDocumentSchema,
} from '../schemas/document.schema';

const c = initContract();

/** Any accepted type; the API sends the file's real Content-Type with the stream. */
const fileResponse = c.type<Blob>();
const dispositionQuery = z.object({
  disposition: z.enum(['inline', 'attachment']).default('inline'),
});

/**
 * Every document in one place (PRD 3.14). Uploads go through the API as multipart form
 * data: a `file` part (JPEG, PNG, WebP, HEIC or PDF, up to 25 MB, checked by its bytes;
 * on a task also voice notes up to 10 MB and videos up to 60 MB) plus the fields of
 * `uploadFieldsSchema`. Works with the web cookie and the mobile token.
 */
export const documentsContract = c.router({
  listDocuments: {
    method: 'GET',
    path: '/documents',
    query: documentFilterSchema,
    responses: { 200: z.array(documentSchema) },
    summary: 'Current documents of a project, task or customer, newest first.',
  },
  uploadDocument: {
    method: 'POST',
    path: '/documents',
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: documentSchema },
    summary: 'Upload a file. The task assignee may attach evidence to their own task.',
  },
  documentFile: {
    method: 'GET',
    path: '/documents/:id/file',
    pathParams: z.object({ id: idSchema }),
    query: dispositionQuery,
    responses: { 200: fileResponse, 206: fileResponse },
    summary:
      'The file itself, streamed from storage after the access check. A `Range` header gets one part (206), so videos can seek.',
  },
  documentThumbnail: {
    method: 'GET',
    path: '/documents/:id/thumbnail',
    pathParams: z.object({ id: idSchema }),
    responses: { 200: fileResponse },
    summary:
      "A photo's small preview (WebP, 400 px long edge) for galleries and tiles, made on upload or on first view; files without one (HEIC, PDF, video) come back as they are. Same access as the file; cacheable, since a document's file never changes.",
  },
  replaceDocument: {
    method: 'POST',
    path: '/documents/:id/replace',
    pathParams: z.object({ id: idSchema }),
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: documentSchema },
    summary: 'Replace the file; the old one is kept in the audit trail with who replaced it.',
  },
  moveDocument: {
    method: 'PATCH',
    path: '/documents/:id',
    pathParams: z.object({ id: idSchema }),
    body: moveDocumentSchema,
    responses: { 200: documentSchema },
    summary:
      "File a customer's paper on another of their homes or as another kind. A request it answered that no longer matches is asked again.",
  },
  removeDocument: {
    method: 'DELETE',
    path: '/documents/:id',
    pathParams: z.object({ id: idSchema }),
    body: c.noBody(),
    responses: { 204: c.noBody() },
    summary: 'Take a file off its task or project (kept in the audit trail).',
  },
  companyAssets: {
    method: 'GET',
    path: '/settings/company/assets',
    responses: { 200: companyAssetsSchema },
    summary: 'The logo, signature and stamp printed on quotations and reports.',
  },
  uploadCompanyAsset: {
    method: 'POST',
    path: '/settings/company/assets/:kind',
    pathParams: z.object({ kind: companyAssetKindSchema }),
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: companyAssetsSchema },
    summary: 'Upload a PNG, JPEG or WebP; it replaces the current one.',
  },
});
