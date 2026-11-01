import { z } from 'zod';
import { idSchema } from '../common/primitives';

/**
 * The DCR papers of one purchase order's goods receipts (PRD 3.10): which lines are DCR
 * panels (their cell details are required), and each receipt's cell details and
 * DCR certificate.
 */
export const orderDcrPapersSchema = z.object({
  /** Order lines for DCR panels: the store must enter the cell maker and invoice. */
  dcrLineIds: z.array(idSchema),
  receipts: z.array(
    z.object({
      receiptId: idSchema,
      number: z.string(),
      certificate: z.object({ documentId: idSchema, name: z.string() }).nullable(),
      /** DCR panel lines on this receipt, with who made the cells and their invoice. */
      cells: z.array(
        z.object({
          description: z.string(),
          cellManufacturer: z.string().nullable(),
          cellInvoiceNumber: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type OrderDcrPapers = z.infer<typeof orderDcrPapersSchema>;
