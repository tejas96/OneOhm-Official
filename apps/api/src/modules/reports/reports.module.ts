import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentChecklistController } from './document-checklist.controller';
import { DocumentChecklistService } from './document-checklist.service';
import { PdfRendererService } from './pdf-renderer.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { ReportArchiveService } from './report-archive.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportStatusService } from './report-status.service';
import { ReportsController } from './reports.controller';

/** Report readiness, the statutory report PDFs and the quotation PDF. */
@Module({
  imports: [DocumentsModule],
  controllers: [ReportsController, DocumentChecklistController],
  providers: [
    ReportStatusService,
    ReportPdfService,
    QuotationPdfService,
    PdfRendererService,
    ReportArchiveService,
    DocumentChecklistService,
  ],
  exports: [
    ReportStatusService,
    QuotationPdfService,
    PdfRendererService,
    ReportPdfService,
    ReportArchiveService,
  ],
})
export class ReportsModule {}
