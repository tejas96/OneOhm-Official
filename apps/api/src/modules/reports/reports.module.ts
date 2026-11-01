import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentChecklistController } from './document-checklist.controller';
import { DocumentChecklistService } from './document-checklist.service';
import { DocumentRequirementsController } from './document-requirements.controller';
import { DocumentRequirementsService } from './document-requirements.service';
import { PdfRendererService } from './pdf-renderer.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { ReportArchiveService } from './report-archive.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportSettingsController } from './report-settings.controller';
import { ReportSettingsService } from './report-settings.service';
import { ReportStatusService } from './report-status.service';
import { ReportsController } from './reports.controller';

/** Report readiness, the statutory report PDFs and the quotation PDF. */
@Module({
  imports: [DocumentsModule],
  controllers: [
    ReportsController,
    DocumentChecklistController,
    ReportSettingsController,
    DocumentRequirementsController,
  ],
  providers: [
    ReportStatusService,
    ReportPdfService,
    QuotationPdfService,
    PdfRendererService,
    ReportArchiveService,
    DocumentChecklistService,
    ReportSettingsService,
    DocumentRequirementsService,
  ],
  exports: [
    ReportStatusService,
    QuotationPdfService,
    PdfRendererService,
    ReportPdfService,
    ReportArchiveService,
    ReportSettingsService,
  ],
})
export class ReportsModule {}
