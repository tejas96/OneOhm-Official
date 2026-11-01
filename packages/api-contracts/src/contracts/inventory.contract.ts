import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  dispatchInputSchema,
  dispatchSchema,
  stockAdjustmentInputSchema,
  stockLocationInputSchema,
  stockLocationSchema,
  stockMovementSchema,
  stockRowSchema,
  thresholdInputSchema,
  vendorInputSchema,
  vendorSchema,
} from '../schemas/inventory.schema';
import {
  projectMaterialSchema,
  purchaseOrderDetailSchema,
  purchaseOrderInputSchema,
  purchaseOrderStatusSchema,
  purchaseOrderSummarySchema,
  receiptInputSchema,
} from '../schemas/procurement.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

const vendors = c.router({
  list: { method: 'GET', path: '/inventory/vendors', responses: { 200: z.array(vendorSchema) } },
  create: {
    method: 'POST',
    path: '/inventory/vendors',
    body: vendorInputSchema,
    responses: { 201: vendorSchema },
  },
  update: {
    method: 'PATCH',
    path: '/inventory/vendors/:id',
    pathParams: idParams,
    body: vendorInputSchema.partial(),
    responses: { 200: vendorSchema },
  },
});

const purchaseOrders = c.router({
  list: {
    method: 'GET',
    path: '/inventory/purchase-orders',
    query: z.object({
      status: purchaseOrderStatusSchema.optional(),
      projectId: idSchema.optional(),
    }),
    responses: { 200: z.array(purchaseOrderSummarySchema) },
  },
  get: {
    method: 'GET',
    path: '/inventory/purchase-orders/:id',
    pathParams: idParams,
    responses: { 200: purchaseOrderDetailSchema },
  },
  create: {
    method: 'POST',
    path: '/inventory/purchase-orders',
    body: purchaseOrderInputSchema,
    responses: { 201: purchaseOrderDetailSchema },
    summary: 'Starts as a draft; sending it fixes the number on the project.',
  },
  send: {
    method: 'POST',
    path: '/inventory/purchase-orders/:id/send',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: purchaseOrderDetailSchema },
  },
  cancel: {
    method: 'POST',
    path: '/inventory/purchase-orders/:id/cancel',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: purchaseOrderDetailSchema },
  },
  close: {
    method: 'POST',
    path: '/inventory/purchase-orders/:id/close',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: purchaseOrderDetailSchema },
    summary: 'Closes a partly received order: the rest will not come.',
  },
  receive: {
    method: 'POST',
    path: '/inventory/purchase-orders/:id/receipts',
    pathParams: idParams,
    body: receiptInputSchema,
    responses: { 201: purchaseOrderDetailSchema },
    summary: 'Goods receipt: adds stock and serials and raises the vendor bill.',
  },
});

const stock = c.router({
  list: { method: 'GET', path: '/inventory/stock', responses: { 200: z.array(stockRowSchema) } },
  locations: {
    method: 'GET',
    path: '/inventory/locations',
    responses: { 200: z.array(stockLocationSchema) },
  },
  createLocation: {
    method: 'POST',
    path: '/inventory/locations',
    body: stockLocationInputSchema,
    responses: { 201: stockLocationSchema },
  },
  adjust: {
    method: 'POST',
    path: '/inventory/stock/adjustments',
    body: stockAdjustmentInputSchema,
    responses: { 201: z.array(stockRowSchema) },
    summary: 'Opening stock and count corrections, always with a reason.',
  },
  setThreshold: {
    method: 'PUT',
    path: '/inventory/stock/:id/threshold',
    pathParams: idParams,
    body: thresholdInputSchema,
    responses: { 200: z.array(stockRowSchema) },
  },
  movements: {
    method: 'GET',
    path: '/inventory/movements',
    query: z.object({ productId: idSchema.optional(), projectId: idSchema.optional() }),
    responses: { 200: z.array(stockMovementSchema) },
  },
  dispatches: {
    method: 'GET',
    path: '/inventory/dispatches',
    responses: { 200: z.array(dispatchSchema) },
  },
});

/** One project's material: what it needs, what is ordered, reserved and on its way. */
const material = c.router({
  get: {
    method: 'GET',
    path: '/projects/:id/material',
    pathParams: idParams,
    responses: { 200: projectMaterialSchema },
  },
  reserve: {
    method: 'POST',
    path: '/projects/:id/material/reserve',
    pathParams: idParams,
    body: z.object({ locationId: idSchema.nullable() }),
    responses: { 200: projectMaterialSchema },
    summary: 'All or nothing: 409 lists each product the store cannot cover.',
  },
  release: {
    method: 'POST',
    path: '/projects/:id/material/release',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: projectMaterialSchema },
  },
  dispatch: {
    method: 'POST',
    path: '/projects/:id/material/dispatches',
    pathParams: idParams,
    body: dispatchInputSchema,
    responses: { 201: projectMaterialSchema },
    summary: 'Sends everything reserved to site on one delivery challan.',
  },
});

export const inventoryContract = c.router({ vendors, purchaseOrders, stock, material });
