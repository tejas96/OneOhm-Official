import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { orderDcrPapersSchema } from '../schemas/receipt-papers.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** DCR papers on goods receipts: cell details and the panel maker's certificate. */
export const receiptPapersRouter = c.router({
  orderDcr: {
    method: 'GET',
    path: '/inventory/purchase-orders/:id/dcr',
    pathParams: idParams,
    responses: { 200: orderDcrPapersSchema },
  },
  attachDcrCertificate: {
    method: 'POST',
    path: '/inventory/receipts/:id/dcr-certificate',
    pathParams: idParams,
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: orderDcrPapersSchema },
    summary: "The panel maker's DCR certificate, filed with the order's documents.",
  },
});
