import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

const c = initContract();

const body = z.object({
  ids: z.array(idSchema).min(1, 'Pick at least one document.').max(60),
  /** The file name without extension, e.g. the project code. */
  name: z.string().trim().max(80).optional(),
});

/** Several documents at once: one ZIP, or one PDF to print (PRD 3.14). */
export const documentBundleContract = c.router({
  zip: {
    method: 'POST',
    path: '/documents/bundle/zip',
    body,
    responses: { 200: c.otherResponse({ contentType: 'application/zip', body: c.type<Blob>() }) },
  },
  pdf: {
    method: 'POST',
    path: '/documents/bundle/pdf',
    body,
    responses: { 200: c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() }) },
    summary:
      'PDFs keep their pages, photos get a page each; other files are listed on a last page.',
  },
});
