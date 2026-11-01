import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { PdfRendererService } from './pdf-renderer.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportStatusService } from './report-status.service';
import { ReportsController } from './reports.controller';

/** Report readiness, the statutory report PDFs and the quotation PDF. */
@Module({
  imports: [DocumentsModule],
  controllers: [ReportsController],
  providers: [ReportStatusService, ReportPdfService, QuotationPdfService, PdfRendererService],
  exports: [ReportStatusService, QuotationPdfService],
})
export class ReportsModule {}
