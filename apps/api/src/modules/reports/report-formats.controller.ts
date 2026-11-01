import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ReportFormatsService } from './report-formats.service';
import { pdfBody } from './reports.controller';

/** Settings → DISCOMs → Report formats (PRD 3.18); every route needs settings.manage. */
@Controller()
export class ReportFormatsController {
  constructor(private readonly formats: ReportFormatsService) {}

  @TsRestHandler(apiContract.reportFormats)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.reportFormats, {
      listReportFormats: async ({ params }) => ({
        status: 200,
        body: await this.formats.list(actor, params.id),
      }),
      createReportFormat: async ({ params, body }) => ({
        status: 201,
        body: await this.formats.create(actor, params.id, body),
      }),
      updateReportFormat: async ({ params, body }) => ({
        status: 200,
        body: await this.formats.update(actor, params.id, body),
      }),
      reportFormatBody: async ({ params }) => ({
        status: 200,
        body: await this.formats.body(actor, params.id),
      }),
      checkReportFormat: async ({ body }) => ({
        status: 200,
        body: await this.formats.check(actor, body.body),
      }),
      reportFormatSamplePdf: async ({ params }) => ({
        status: 200,
        body: pdfBody(await this.formats.samplePdf(actor, params.id), 'inline'),
      }),
    });
  }
}
