import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { documentChecklistSchema } from '../schemas/document-checklist.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** What papers a project needs and which are missing, and a printable copy (PRD 3.14). */
export const documentChecklistContract = c.router({
  checklist: {
    method: 'GET',
    path: '/projects/:id/document-checklist',
    pathParams: idParams,
    responses: { 200: documentChecklistSchema },
  },
  checklistPdf: {
    method: 'GET',
    path: '/projects/:id/document-checklist/pdf',
    pathParams: idParams,
    responses: { 200: c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() }) },
  },
});
