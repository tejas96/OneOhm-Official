import { Module } from '@nestjs/common';
import { BusinessReportsController } from './business-reports.controller';
import { BusinessReportsService } from './business-reports.service';
import { BusinessReportsCsvController } from './business-reports-csv.controller';
import { CollectionsReportService } from './collections-report.service';
import { DelaysReportService } from './delays-report.service';
import { DeliveryReportService } from './delivery-report.service';
import { ProfitabilityReportService } from './profitability-report.service';
import { SalesReportService } from './sales-report.service';
import { ServiceReportService } from './service-report.service';
import { TeamReportService } from './team-report.service';

/** The owner's business reports (PRD 3.1), like Lintel's: one tab per question. */
@Module({
  controllers: [BusinessReportsController, BusinessReportsCsvController],
  providers: [
    BusinessReportsService,
    SalesReportService,
    DeliveryReportService,
    DelaysReportService,
    CollectionsReportService,
    ProfitabilityReportService,
    TeamReportService,
    ServiceReportService,
  ],
})
export class BusinessReportsModule {}
