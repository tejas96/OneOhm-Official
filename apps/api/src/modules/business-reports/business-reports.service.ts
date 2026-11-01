import { Injectable } from '@nestjs/common';
import type { BusinessReportName, BusinessReportQuery } from '@oneohm/api-contracts';
import { CollectionsReportService } from './collections-report.service';
import type { CsvTable } from './csv';
import { DelaysReportService } from './delays-report.service';
import { DeliveryReportService } from './delivery-report.service';
import { ProfitabilityReportService } from './profitability-report.service';
import { SalesReportService } from './sales-report.service';
import { ServiceReportService } from './service-report.service';
import { TeamReportService } from './team-report.service';

/** Every business report in one place, so the JSON and CSV routes share them. */
@Injectable()
export class BusinessReportsService {
  constructor(
    readonly sales: SalesReportService,
    readonly delivery: DeliveryReportService,
    readonly delays: DelaysReportService,
    readonly collections: CollectionsReportService,
    readonly profitability: ProfitabilityReportService,
    readonly team: TeamReportService,
    readonly service: ServiceReportService,
  ) {}

  /** The report as a sheet: the same numbers as the screen's main table. */
  async csv(name: BusinessReportName, query: BusinessReportQuery): Promise<CsvTable> {
    switch (name) {
      case 'sales':
        return this.sales.csv(await this.sales.report(query));
      case 'delivery':
        return this.delivery.csv(await this.delivery.report(query));
      case 'delays':
        return this.delays.csv(await this.delays.report(query));
      case 'collections':
        return this.collections.csv(await this.collections.report(query));
      case 'profitability':
        return this.profitability.csv(await this.profitability.report(query));
      case 'team':
        return this.team.csv(await this.team.report(query));
      default:
        return this.service.csv(await this.service.report(query));
    }
  }
}
