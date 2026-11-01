import { Controller, Get, Inject, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { reportKeySchema } from '@oneohm/api-contracts';
import { payments, projects } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CustomerDocumentsService } from '../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../customer-portal/customer-portal.service';
import { CustomerBillingService } from '../finance/customer-billing.service';
import { ReceiptPdfService } from '../finance/receipt-pdf.service';
import { QuotationPdfService } from '../reports/quotation-pdf.service';
import type { PdfFile } from '../reports/report-pdf.service';
import { readFileLink, type SharedFile } from './file-links';
import { stillIssued } from './shared-invoices';

const pdf = ({ content, fileName }: PdfFile) =>
  new StreamableFile(content, {
    type: 'application/pdf',
    length: content.length,
    disposition: `inline; filename="${fileName}"`,
  });

/** Opens a file the WhatsApp assistant shared, only while its signed link is valid. */
@Public()
@Controller('v1/files/shared')
export class SharedFilesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly papers: CustomerDocumentsService,
    private readonly quotations: QuotationPdfService,
    private readonly receipts: ReceiptPdfService,
    private readonly billing: CustomerBillingService,
  ) {}

  @Get(':token')
  async open(@Param('token') token: string): Promise<StreamableFile> {
    const file = readFileLink(this.env.FILE_LINK_SECRET, token);
    if (!file) throw new NotFoundException('This link has expired. Ask again on WhatsApp.');
    if (file.kind === 'quotation') {
      const id = await this.portal.ownQuotation(file.customerId, file.id);
      return pdf(await this.quotations.render(id));
    }
    if (file.kind === 'receipt') return pdf(await this.receipt(file));
    if (file.kind === 'invoice') {
      // A cancelled invoice is never shared, even through a link sent before.
      if (!(await stillIssued(this.db, file.id))) throw new NotFoundException();
      return pdf(await this.billing.invoice(file.customerId, file.id));
    }
    if (file.kind === 'report') {
      const key = reportKeySchema.safeParse(file.key);
      if (!key.success) throw new NotFoundException();
      return pdf(await this.papers.reportPdf(file.customerId, file.id, key.data));
    }
    const stored = await this.papers.file(file.customerId, file.id);
    return new StreamableFile(stored.body, {
      type: stored.type,
      disposition: `inline; filename="${stored.name.replaceAll('"', '')}"`,
    });
  }

  private async receipt(file: SharedFile): Promise<PdfFile> {
    const [own] = await this.db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .where(and(eq(payments.id, file.id), eq(projects.customerId, file.customerId)));
    if (!own) throw new NotFoundException();
    return this.receipts.render(file.id);
  }
}
