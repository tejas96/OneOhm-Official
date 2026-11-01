import { Controller, Get, Inject, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { payments, projects } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CustomerDocumentsService } from '../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../customer-portal/customer-portal.service';
import { ReceiptPdfService } from '../finance/receipt-pdf.service';
import { QuotationPdfService } from '../reports/quotation-pdf.service';
import { readFileLink } from './file-links';

const pdf = (content: Buffer, fileName: string) =>
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
  ) {}

  @Get(':token')
  async open(@Param('token') token: string): Promise<StreamableFile> {
    const file = readFileLink(this.env.FILE_LINK_SECRET, token);
    if (!file) throw new NotFoundException('This link has expired. Ask again on WhatsApp.');
    if (file.kind === 'quotation') {
      const id = await this.portal.ownQuotation(file.customerId, file.id);
      const rendered = await this.quotations.render(id);
      return pdf(rendered.content, rendered.fileName);
    }
    if (file.kind === 'receipt') {
      const [own] = await this.db
        .select({ id: payments.id })
        .from(payments)
        .innerJoin(projects, eq(projects.id, payments.projectId))
        .where(and(eq(payments.id, file.id), eq(projects.customerId, file.customerId)));
      if (!own) throw new NotFoundException();
      const rendered = await this.receipts.render(file.id);
      return pdf(rendered.content, rendered.fileName);
    }
    const stored = await this.papers.file(file.customerId, file.id);
    return new StreamableFile(stored.body, {
      type: stored.type,
      disposition: `inline; filename="${stored.name.replaceAll('"', '')}"`,
    });
  }
}
