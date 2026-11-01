import { Controller, StreamableFile } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { QuotationPdfService } from './quotation-pdf.service';
import { ReportArchiveService } from './report-archive.service';
import type { PdfFile } from './report-pdf.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportStatusService } from './report-status.service';

/**
 * The PDF body. Nest streams a StreamableFile with these headers; the contract types the
 * body as a Blob because that is what the web client receives.
 */
export function pdfBody(file: PdfFile, disposition: 'inline' | 'attachment'): Blob {
  const stream = new StreamableFile(file.content, {
    type: 'application/pdf',
    length: file.content.length,
    disposition: `${disposition}; filename="${file.fileName}"`,
  });
  return stream as unknown as Blob;
}

@Controller()
export class ReportsController {
  constructor(
    private readonly statuses: ReportStatusService,
    private readonly reports: ReportPdfService,
    private readonly quotations: QuotationPdfService,
    private readonly archive: ReportArchiveService,
  ) {}

  @TsRestHandler(apiContract.reports)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.reports, {
      reportsOverview: async () => {
        assertCan(actor, 'reports.generate');
        return { status: 200, body: await this.statuses.overview() };
      },
      listProjectReports: async ({ params }) => {
        assertCan(actor, 'reports.generate', 'projects.view_all');
        return { status: 200, body: await this.statuses.statuses(params.id) };
      },
      archiveProjectReports: async ({ params }) => {
        assertCan(actor, 'reports.generate');
        return { status: 200, body: await this.archive.refresh(params.id, actor.userId) };
      },
      projectReportPdf: async ({ params, query }) => {
        assertCan(actor, 'reports.generate');
        const file = await this.reports.render(params.id, params.reportKey);
        return { status: 200, body: pdfBody(file, query.disposition) };
      },
      quotationPdf: async ({ params, query }) => {
        assertCan(actor, 'quotations.view', 'quotations.create');
        const file = await this.quotations.render(params.id);
        return { status: 200, body: pdfBody(file, query.disposition) };
      },
    });
  }
}
