import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { documents } from '@oneohm/database';
import { SYSTEM_PAPER_CATEGORY, systemPaperAction } from '@oneohm/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { DATABASE, type Database } from '../../config/core.module';
import { WorkOrderPdfService } from '../contractors/work-order-pdf.service';
import { presentWorkOrder } from '../contractors/work-order-read';
import { ObjectStorageService } from '../documents/object-storage.service';
import { setSystemPaperFiler } from '../documents/system-papers-hook';
import { InvoicePdfService } from '../finance/invoice-pdf.service';
import { ReceiptPdfService } from '../finance/receipt-pdf.service';
import { QuotationPdfService } from '../reports/quotation-pdf.service';
import type { PdfFile } from '../reports/report-pdf.service';
import {
  type FiledPaper,
  filedPapers,
  type PaperScope,
  type WantedPaper,
  wantedPapers,
} from './system-paper-sources';

const EVERY_MINUTES = 2;

/**
 * Files the papers OneOhm prints itself in the documents (PRD 3.14): the accepted
 * quotation, tax invoices, receipts and work orders, linked to the project, customer and
 * site (and the contractor for a work order), so the checklist sees them. Checked every
 * few minutes and whenever a project's documents open; a changed paper (a cancelled
 * invoice, a reversed payment, an edited work order) replaces its earlier copy, which
 * stays in the audit trail.
 */
@Injectable()
export class SystemPapersService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('SystemPapers');
  private timer: ReturnType<typeof setInterval> | null = null;
  /** One run at a time, so a paper is never filed twice. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
    private readonly quotations: QuotationPdfService,
    private readonly invoices: InvoicePdfService,
    private readonly receipts: ReceiptPdfService,
    private readonly workOrders: WorkOrderPdfService,
  ) {}

  onApplicationBootstrap(): void {
    setSystemPaperFiler((scope) => this.file(scope));
    void this.file({});
    this.timer = setInterval(() => void this.file({}), EVERY_MINUTES * 60_000);
  }

  onModuleDestroy(): void {
    setSystemPaperFiler(null);
    if (this.timer) clearInterval(this.timer);
  }

  /** Files what is missing or changed in the scope ({} is everything); the count filed. */
  file(scope: PaperScope): Promise<number> {
    const run = this.queue.then(() => this.run(scope));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async run(scope: PaperScope): Promise<number> {
    let filed = 0;
    try {
      const wanted = await wantedPapers(this.db, scope);
      const current = await filedPapers(this.db);
      for (const paper of wanted) {
        const existing = current.get(`${paper.kind}:${paper.sourceId}`) ?? null;
        const action = systemPaperAction(existing?.key ?? null, paper.key);
        if (action === 'keep') {
          if (existing) await this.relink(existing, paper);
          continue;
        }
        if (await this.fileOne(paper, existing)) filed += 1;
      }
      if (filed > 0) this.log.log(`Filed ${filed} system papers.`);
    } catch (error) {
      this.log.error(`Filing system papers failed: ${String(error)}`);
    }
    return filed;
  }

  /** A quotation filed before its project existed gets the project once there is one. */
  private async relink(existing: FiledPaper, paper: WantedPaper): Promise<void> {
    if (existing.removed || existing.projectId || !paper.projectId) return;
    await this.db
      .update(documents)
      .set({ projectId: paper.projectId })
      .where(eq(documents.id, existing.id));
  }

  private render(paper: WantedPaper): Promise<PdfFile> {
    switch (paper.kind) {
      case 'quotation':
        return this.quotations.render(paper.sourceId);
      case 'invoice':
        return this.invoices.render(paper.sourceId);
      case 'receipt':
        return this.receipts.render(paper.sourceId);
      case 'work_order':
        return presentWorkOrder(this.db, paper.sourceId).then((order) =>
          this.workOrders.render(order),
        );
    }
  }

  private async fileOne(paper: WantedPaper, existing: FiledPaper | null): Promise<boolean> {
    let file: PdfFile;
    try {
      file = await this.render(paper);
    } catch (error) {
      this.log.warn(`Could not print ${paper.name}: ${String(error)}`);
      return false;
    }
    await this.storage.put(paper.key, file.content, 'application/pdf');
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`oneohm:${paper.key}`}))`);
      const [already] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.storageKey, paper.key), isNull(documents.replacedAt)))
        .limit(1);
      if (already) return false;
      const now = new Date();
      if (existing && !existing.removed) {
        await tx.update(documents).set({ replacedAt: now }).where(eq(documents.id, existing.id));
      }
      const [row] = await tx
        .insert(documents)
        .values({
          projectId: paper.projectId,
          customerId: paper.customerId,
          propertyId: paper.propertyId,
          leadId: paper.leadId,
          contractorId: paper.contractorId,
          category: SYSTEM_PAPER_CATEGORY[paper.kind],
          source: 'system',
          checkedAt: new Date(),
          name: paper.name,
          storageKey: paper.key,
          contentType: 'application/pdf',
          sizeBytes: file.content.length,
          replacesDocumentId: existing && !existing.removed ? existing.id : null,
        })
        .returning({ id: documents.id });
      if (!row) throw new Error('Document insert returned nothing.');
      await recordAudit(tx, null, 'document.filed_by_system', 'document', row.id, {
        kind: paper.kind,
        sourceId: paper.sourceId,
        replaces: existing?.id ?? null,
      });
      return true;
    });
  }
}
