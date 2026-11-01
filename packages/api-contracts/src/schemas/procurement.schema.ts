import { LINE_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, paiseSchema } from '../common/primitives';
import { dispatchSchema, quantitySchema } from './inventory.schema';

export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'sent',
  'partly_received',
  'received',
  'closed',
  'cancelled',
] as const;
export const purchaseOrderStatusSchema = z.enum(PURCHASE_ORDER_STATUSES);
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

export const purchaseOrderSummarySchema = z.object({
  id: idSchema,
  number: z.string(),
  status: purchaseOrderStatusSchema,
  vendorId: idSchema,
  vendorName: z.string(),
  projectId: idSchema.nullable(),
  projectCode: z.string().nullable(),
  orderDate: calendarDateSchema,
  expectedOn: calendarDateSchema.nullable(),
  totalPaise: paiseSchema,
  lineCount: z.number().int(),
  /** Share of ordered quantity received so far, 0 to 1. */
  receivedShare: z.number(),
});
export type PurchaseOrderSummary = z.infer<typeof purchaseOrderSummarySchema>;

export const purchaseOrderLineSchema = z.object({
  id: idSchema,
  productId: idSchema.nullable(),
  category: z.enum(LINE_CATEGORIES).nullable(),
  serialised: z.boolean(),
  description: z.string(),
  unit: z.string(),
  quantity: z.number(),
  receivedQuantity: z.number(),
  ratePaise: paiseSchema,
  taxRateBp: z.number().int(),
  totalPaise: paiseSchema,
});
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;

export const goodsReceiptSchema = z.object({
  id: idSchema,
  number: z.string(),
  receivedOn: calendarDateSchema,
  locationName: z.string(),
  vendorInvoiceNumber: z.string().nullable(),
  amountPaise: paiseSchema,
  by: z.string().nullable(),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      serials: z.array(z.string()),
      /** Units that failed inspection and went back to the vendor. */
      rejectedQuantity: z.number(),
      rejectionReason: z.string().nullable(),
    }),
  ),
});

export const purchaseOrderDetailSchema = purchaseOrderSummarySchema.extend({
  vendorGstin: z.string().nullable(),
  projectName: z.string().nullable(),
  notes: z.string().nullable(),
  subtotalPaise: paiseSchema,
  taxPaise: paiseSchema,
  lines: z.array(purchaseOrderLineSchema),
  receipts: z.array(goodsReceiptSchema),
  createdBy: z.string().nullable(),
});
export type PurchaseOrderDetail = z.infer<typeof purchaseOrderDetailSchema>;

export const purchaseOrderLineInputSchema = z.object({
  productId: idSchema.nullable(),
  description: z.string().trim().min(2, 'Describe the item.').max(200),
  unit: z.string().trim().min(1).max(12),
  quantity: quantitySchema.refine((value) => value > 0, 'Enter a quantity above 0.'),
  ratePaise: paiseSchema.nonnegative(),
  taxRateBp: z.number().int().min(0).max(2800),
});

export const purchaseOrderInputSchema = z.object({
  vendorId: idSchema,
  projectId: idSchema.nullable(),
  orderDate: calendarDateSchema,
  expectedOn: calendarDateSchema.nullable(),
  notes: optional(1000),
  lines: z.array(purchaseOrderLineInputSchema).min(1, 'Add at least one line.').max(100),
});
export type PurchaseOrderInput = z.input<typeof purchaseOrderInputSchema>;
export type PurchaseOrderData = z.output<typeof purchaseOrderInputSchema>;

export const receiptInputSchema = z.object({
  locationId: idSchema.nullable(),
  receivedOn: calendarDateSchema,
  vendorInvoiceNumber: optional(60),
  vendorInvoiceDate: calendarDateSchema.nullable(),
  notes: optional(500),
  lines: z
    .array(
      z.object({
        lineId: idSchema,
        quantity: quantitySchema,
        serials: z.array(z.string().trim().max(80)).max(2000).default([]),
        cellManufacturer: optional(160),
        cellInvoiceNumber: optional(60),
        /** Units that failed inspection: sent back, not stocked or billed, still due. */
        rejectedQuantity: quantitySchema
          .refine((value) => value >= 0, 'Enter 0 or more.')
          .default(0),
        rejectionReason: optional(300),
      }),
    )
    .min(1, 'Enter what arrived.'),
});
export type ReceiptInput = z.input<typeof receiptInputSchema>;
export type ReceiptData = z.output<typeof receiptInputSchema>;

/** What a project needs from the store (from its accepted quotation) and where it stands. */
export const materialRequirementSchema = z.object({
  productId: idSchema,
  name: z.string(),
  brand: z.string(),
  category: z.enum(LINE_CATEGORIES),
  unit: z.string(),
  ratePaise: paiseSchema,
  taxRateBp: z.number().int(),
  needed: z.number(),
  ordered: z.number(),
  reserved: z.number(),
  dispatched: z.number(),
  /** Handed from the store straight to the project's contractor. */
  issued: z.number(),
  /** Free stock in the store that could be reserved now. */
  freeInStore: z.number(),
});
export type MaterialRequirement = z.infer<typeof materialRequirementSchema>;

export const projectMaterialSchema = z.object({
  projectId: idSchema,
  projectCode: z.string(),
  projectName: z.string(),
  stage: z.enum(['to_order', 'ordered', 'reserved', 'dispatched']),
  requirements: z.array(materialRequirementSchema),
  purchaseOrders: z.array(purchaseOrderSummarySchema),
  serials: z.array(
    z.object({
      productName: z.string(),
      serial: z.string(),
      status: z.enum(['in_stock', 'reserved', 'dispatched']),
    }),
  ),
  dispatches: z.array(dispatchSchema),
  /** Report facts filled from purchasing and the store, keyed like task captures. */
  facts: z.record(z.string(), z.string()),
});
export type ProjectMaterial = z.infer<typeof projectMaterialSchema>;
