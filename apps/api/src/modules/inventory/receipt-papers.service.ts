import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { OrderDcrPapers } from '@oneohm/api-contracts';
import {
  documents,
  goodsReceiptLines,
  goodsReceipts,
  products,
  projects,
  purchaseOrderLines,
  purchaseOrders,
} from '@oneohm/database';
import { ACCEPTED_FILE_TYPES } from '@oneohm/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../documents/upload-file';

/**
 * DCR papers on goods receipts (PRD 3.10): which order lines are DCR panels, the cell
 * details the store entered, and the panel maker's DCR certificate. The certificate is
 * filed with the project's documents (under DCR certificate) when the order is for one.
 */
@Injectable()
export class ReceiptPapersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
  ) {}

  async orderDcr(orderId: string): Promise<OrderDcrPapers> {
    const lines = await this.db
      .select({ id: purchaseOrderLines.id, description: purchaseOrderLines.description })
      .from(purchaseOrderLines)
      .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
      .where(
        and(
          eq(purchaseOrderLines.purchaseOrderId, orderId),
          eq(products.category, 'panel'),
          eq(products.dcr, true),
        ),
      );
    const receipts = await this.db
      .select({
        id: goodsReceipts.id,
        number: goodsReceipts.number,
        documentId: documents.id,
        documentName: documents.name,
      })
      .from(goodsReceipts)
      .leftJoin(documents, eq(documents.id, goodsReceipts.dcrCertificateDocumentId))
      .where(eq(goodsReceipts.purchaseOrderId, orderId))
      .orderBy(desc(goodsReceipts.createdAt));
    const cells =
      lines.length > 0 && receipts.length > 0
        ? await this.db
            .select()
            .from(goodsReceiptLines)
            .where(
              and(
                inArray(
                  goodsReceiptLines.receiptId,
                  receipts.map((row) => row.id),
                ),
                inArray(
                  goodsReceiptLines.purchaseOrderLineId,
                  lines.map((line) => line.id),
                ),
              ),
            )
        : [];
    return {
      dcrLineIds: lines.map((line) => line.id),
      receipts: receipts.map((receipt) => ({
        receiptId: receipt.id,
        number: receipt.number,
        certificate:
          receipt.documentId && receipt.documentName
            ? { documentId: receipt.documentId, name: receipt.documentName }
            : null,
        cells: cells
          .filter((cell) => cell.receiptId === receipt.id)
          .map((cell) => ({
            description:
              lines.find((line) => line.id === cell.purchaseOrderLineId)?.description ?? '',
            cellManufacturer: cell.cellManufacturer,
            cellInvoiceNumber: cell.cellInvoiceNumber,
          })),
      })),
    };
  }

  /** Files the certificate (a PDF or photo) and links it to the receipt; a new one replaces it. */
  async attach(
    actor: Actor,
    receiptId: string,
    file: IncomingFile | undefined,
  ): Promise<OrderDcrPapers> {
    const [row] = await this.db
      .select({
        receipt: goodsReceipts,
        order: purchaseOrders,
        customerId: projects.customerId,
        propertyId: projects.propertyId,
      })
      .from(goodsReceipts)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
      .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
      .where(eq(goodsReceipts.id, receiptId));
    if (!row) throw notFound('That goods receipt');
    const { receipt, order } = row;
    const checked = checkFile(file, ACCEPTED_FILE_TYPES, `DCR certificate ${receipt.number}`);
    const scope = order.projectId ? `projects/${order.projectId}` : `purchase-orders/${order.id}`;
    const storageKey = `${scope}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    await this.db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          projectId: order.projectId,
          customerId: row.customerId,
          propertyId: row.propertyId,
          category: 'dcr_certificate',
          source: 'upload',
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
          uploadedByUserId: actor.userId,
          replacesDocumentId: receipt.dcrCertificateDocumentId,
        })
        .returning({ id: documents.id });
      if (!document) throw new Error('Document insert returned nothing.');
      // The earlier certificate stays for the audit trail, marked replaced.
      if (receipt.dcrCertificateDocumentId) {
        await tx
          .update(documents)
          .set({ replacedAt: new Date(), replacedByUserId: actor.userId })
          .where(eq(documents.id, receipt.dcrCertificateDocumentId));
      }
      await tx
        .update(goodsReceipts)
        .set({ dcrCertificateDocumentId: document.id })
        .where(eq(goodsReceipts.id, receipt.id));
      await recordAudit(
        tx,
        actor.userId,
        'goods_receipt.dcr_certificate',
        'purchase_order',
        order.id,
        {
          receipt: receipt.number,
          documentId: document.id,
        },
      );
    });
    return this.orderDcr(order.id);
  }
}
