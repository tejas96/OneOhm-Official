import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { BUSINESS_REPORTS, businessReportQuerySchema } from '@oneohm/api-contracts';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { invalid, notFound } from '../../common/http/errors';
import { BusinessReportsService } from './business-reports.service';
import { encodeCsv } from './csv';

/** "Download CSV" on every report: the same filters, the report's main table as a sheet. */
@Controller('v1/business-reports')
export class BusinessReportsCsvController {
  constructor(private readonly reports: BusinessReportsService) {}

  @Get(':name/csv')
  async csv(
    @CurrentActor() actor: Actor,
    @Param('name') name: string,
    @Query() raw: Record<string, string>,
  ): Promise<StreamableFile> {
    assertCan(actor, 'dashboard.view_business');
    const report = BUSINESS_REPORTS.find((entry) => entry === name);
    if (!report) throw notFound('That report');
    const query = businessReportQuerySchema.safeParse({
      period: raw.period,
      managerUserId: raw.manager ?? raw.managerUserId,
      projectType: raw.type ?? raw.projectType,
    });
    if (!query.success) throw invalid('Those filters are not valid.');
    const table = await this.reports.csv(report, query.data);
    const body = Buffer.from(encodeCsv(table), 'utf8');
    const file = `${table.fileName.replace(/[^\w .-]+/g, '-')}.csv`;
    return new StreamableFile(body, {
      type: 'text/csv; charset=utf-8',
      length: body.length,
      disposition: `attachment; filename="${file}"`,
    });
  }
}
