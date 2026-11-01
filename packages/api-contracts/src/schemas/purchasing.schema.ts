import {
  LINE_CATEGORIES,
  PURCHASE_REQUEST_STATUSES,
  VENDOR_ADVANCE_STATUSES,
} from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { moneyInMethodSchema, moneyOutMethodSchema } from './finance.schema';
import { quantitySchema, vendorSchema } from './inventory.schema';
import { purchaseOrderStatusSchema } from './procurement.schema';

const person = z.object({ id: idSchema, fullName: z.string() });
const note = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

export const purchaseRequestStatusSchema = z.enum(PURCHASE_REQUEST_STATUSES);
export type PurchaseRequestStatus = z.infer<typeof purchaseRequestStatusSchema>;

export const purchaseRequestLineSchema = z.object({
  id: idSchema,
  productId: idSchema,
  sku: z.string(),
  name: z.string(),
  category: z.enum(LINE_CATEGORIES),
  unit: z.string(),
  quantity: z.number(),
  neededBy: calendarDateSchema,
  /** The catalog's purchase rate and GST, to start the order from. */
  costPaise: paiseSchema,
  taxRateBp: z.number().int(),
  /** Free stock across every store right now. */
  freeInStore: z.number(),
});

/** A request for material and where it stands (PRD 3.10). */
export const purchaseRequestSchema = z.object({
  id: idSchema,
  number: z.string(),
  status: purchaseRequestStatusSchema,
  project: z.object({ id: idSchema, code: z.string(), name: z.string() }).nullable(),
  reason: z.string(),
  requestedBy: person,
  requestedAt: instantSchema,
  /** The earliest need-by date across its lines. */
  neededBy: calendarDateSchema.nullable(),
  decidedBy: person.nullable(),
  decidedAt: instantSchema.nullable(),
  decisionNote: z.string().nullable(),
  purchaseOrder: z
    .object({ id: idSchema, number: z.string(), status: purchaseOrderStatusSchema })
    .nullable(),
  lines: z.array(purchaseRequestLineSchema),
});
export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;

export const purchaseRequestInputSchema = z.object({
  projectId: idSchema.nullable(),
  reason: z.string().trim().min(3, 'Say why the material is needed.').max(500),
  lines: z
    .array(
      z.object({
        productId: idSchema,
        quantity: quantitySchema.refine((value) => value > 0, 'Enter a quantity above 0.'),
        neededBy: calendarDateSchema,
      }),
    )
    .min(1, 'Add at least one item.')
    .max(50),
});
export type PurchaseRequestInput = z.input<typeof purchaseRequestInputSchema>;
export type PurchaseRequestData = z.output<typeof purchaseRequestInputSchema>;

export const requestDecisionSchema = z.object({ note: note(500) });
export const requestRejectionSchema = z.object({
  note: z.string().trim().min(3, 'Say why it is rejected.').max(500),
});

/** Turning an approved request into a draft order: the vendor and the agreed rates. */
export const requestOrderInputSchema = z.object({
  vendorId: idSchema,
  orderDate: calendarDateSchema,
  expectedOn: calendarDateSchema.nullable(),
  lines: z
    .array(
      z.object({
        lineId: idSchema,
        ratePaise: paiseSchema.nonnegative(),
        taxRateBp: z.number().int().min(0).max(2800),
      }),
    )
    .min(1),
});
export type RequestOrderInput = z.infer<typeof requestOrderInputSchema>;

export const vendorAdvanceStatusSchema = z.enum(VENDOR_ADVANCE_STATUSES);

/** Money paid to a vendor before the goods, against one purchase order. */
export const vendorAdvanceSchema = z.object({
  id: idSchema,
  number: z.string(),
  status: vendorAdvanceStatusSchema,
  vendor: z.object({ id: idSchema, name: z.string() }),
  purchaseOrder: z.object({
    id: idSchema,
    number: z.string(),
    status: purchaseOrderStatusSchema,
    totalPaise: paiseSchema,
  }),
  projectCode: z.string().nullable(),
  amountPaise: paiseSchema,
  /** Set against the vendor's approved bills so far. */
  adjustedPaise: paiseSchema,
  /** Paid and not yet set against a bill. */
  openPaise: paiseSchema,
  note: z.string().nullable(),
  recordedBy: person.nullable(),
  approvedBy: person.nullable(),
  approvedAt: instantSchema.nullable(),
  paidOn: calendarDateSchema.nullable(),
  paidMethod: moneyInMethodSchema.nullable(),
  paidReference: z.string().nullable(),
  createdAt: instantSchema,
  adjustments: z.array(
    z.object({
      payableId: idSchema,
      description: z.string(),
      amountPaise: paiseSchema,
      adjustedOn: calendarDateSchema,
    }),
  ),
});
export type VendorAdvance = z.infer<typeof vendorAdvanceSchema>;

export const vendorAdvanceInputSchema = z.object({
  purchaseOrderId: idSchema,
  amountPaise: paiseSchema.positive('Enter an amount above zero.'),
  note: note(300),
});
export type VendorAdvanceInput = z.input<typeof vendorAdvanceInputSchema>;

export const vendorAdvancePaySchema = z.object({
  method: moneyOutMethodSchema,
  paidOn: calendarDateSchema,
  reference: note(120),
});

export const ageingBucketsSchema = z.object({
  current: paiseSchema,
  days_31_60: paiseSchema,
  days_61_90: paiseSchema,
  days_over_90: paiseSchema,
});

/** One vendor's delivery record and what OneOhm owes them (PRD 3.10). */
export const vendorScorecardSchema = z.object({
  vendorId: idSchema,
  name: z.string(),
  active: z.boolean(),
  orders: z.number().int(),
  orderedPaise: paiseSchema,
  delivered: z.number().int(),
  onTime: z.number().int(),
  late: z.number().int(),
  openLate: z.number().int(),
  onTimeBp: z.number().int().nullable(),
  averageDaysToDeliver: z.number().nullable(),
  receipts: z.number().int(),
  /** Goods receipts with at least one line that failed inspection. */
  inspectionFailures: z.number().int(),
  outstandingPaise: paiseSchema,
  overduePaise: paiseSchema,
  ageing: ageingBucketsSchema,
  openAdvancesPaise: paiseSchema,
});
export type VendorScorecard = z.infer<typeof vendorScorecardSchema>;

export const deliveryOutcomeSchema = z.enum([
  'on_time',
  'late',
  'open_late',
  'open',
  'no_date',
  'not_ordered',
]);

export const vendorProfileSchema = z.object({
  vendor: vendorSchema,
  scorecard: vendorScorecardSchema,
  orders: z.array(
    z.object({
      id: idSchema,
      number: z.string(),
      status: purchaseOrderStatusSchema,
      projectCode: z.string().nullable(),
      orderDate: calendarDateSchema,
      expectedOn: calendarDateSchema.nullable(),
      lastReceivedOn: calendarDateSchema.nullable(),
      outcome: deliveryOutcomeSchema,
      totalPaise: paiseSchema,
    }),
  ),
  bills: z.array(
    z.object({
      id: idSchema,
      description: z.string(),
      billNumber: z.string().nullable(),
      billedOn: calendarDateSchema,
      dueOn: calendarDateSchema,
      amountPaise: paiseSchema,
      adjustedPaise: paiseSchema,
      balancePaise: paiseSchema,
      status: z.enum(['pending', 'approved', 'paid']),
      overdue: z.boolean(),
    }),
  ),
  rejections: z.array(
    z.object({
      receiptNumber: z.string(),
      receivedOn: calendarDateSchema,
      description: z.string(),
      unit: z.string(),
      rejectedQuantity: z.number(),
      reason: z.string().nullable(),
    }),
  ),
  advances: z.array(vendorAdvanceSchema),
});
export type VendorProfile = z.infer<typeof vendorProfileSchema>;
