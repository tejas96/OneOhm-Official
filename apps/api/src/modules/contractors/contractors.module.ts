import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { ContractorCrewService } from './contractor-crew.service';
import { ContractorsController } from './contractors.controller';
import { ContractorsService } from './contractors.service';
import { CrewPortalService } from './crew-portal.service';
import { WorkOrderAdjustmentsService } from './work-order-adjustments.service';
import { WorkOrderPdfService } from './work-order-pdf.service';
import { WorkOrdersService } from './work-orders.service';

/** Contractors, crews, rate cards and work orders (PRD 3.13). */
@Module({
  imports: [ReportsModule],
  controllers: [ContractorsController],
  providers: [
    ContractorsService,
    ContractorCrewService,
    WorkOrdersService,
    WorkOrderAdjustmentsService,
    WorkOrderPdfService,
    CrewPortalService,
  ],
})
export class ContractorsModule {}
