import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { productSchema } from '../schemas/catalog.schema';

const c = initContract();

/** The maker's datasheet on a product (Settings → Products, PRD 3.5 specifications). */
export const productDatasheetContract = c.router({
  uploadProductDatasheet: {
    method: 'POST',
    path: '/catalog/products/:id/datasheet',
    pathParams: z.object({ id: idSchema }),
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: productSchema },
    summary: "The maker's datasheet (PDF or image); it replaces the current one.",
  },
});
