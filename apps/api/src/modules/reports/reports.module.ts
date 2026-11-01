import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentChecklistController } from './document-checklist.controller';
import { DocumentChecklistService } from './document-checklist.service';
import { DocumentRequirementsController } from './document-requirements.controller';
import { DocumentRequirementsService } from './document-requirements.service';
import { PdfRendererService } from './pdf-renderer.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { ReportArchiveService } from './report-archive.service';
import { ReportFactsService } from './report-facts.service';
import { ReportFormatsController } from './report-formats.controller';
import { ReportFormatsService } from './report-formats.service';
import { ReportFormatsStore } from './report-formats.store';
import { ReportPdfService } from './report-pdf.service';
import { ReportSettingsController } from './report-settings.controller';
import { ReportSettingsService } from './report-settings.service';
import { ReportStatusService } from './report-status.service';
import { ReportSubmissionsService } from './report-submissions.service';
import { ReportSweepService } from './report-sweep.service';
import { ReportsController } from './reports.controller';
import { SurveyReportService } from './survey-report.service';

/** Report readiness, the statutory report PDFs and the quotation PDF. */
@Module({
  imports: [DocumentsModule],
  controllers: [
    ReportsController,
    DocumentChecklistController,
    ReportSettingsController,
    ReportFormatsController,
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
    SurveyReportService,
    ReportSubmissionsService,
    ReportFactsService,
    ReportSweepService,
    ReportFormatsStore,
    ReportFormatsService,
  ],
  exports: [
    ReportStatusService,
    QuotationPdfService,
    PdfRendererService,
    ReportPdfService,
    ReportArchiveService,
    ReportSettingsService,
    SurveyReportService,
  ],
})
export class ReportsModule {}
