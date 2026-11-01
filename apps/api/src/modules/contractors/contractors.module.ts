import { Module } from '@nestjs/common';
import { ContractorCrewService } from './contractor-crew.service';
import { ContractorsController } from './contractors.controller';
import { ContractorsService } from './contractors.service';
import { WorkOrderAdjustmentsService } from './work-order-adjustments.service';
import { WorkOrdersService } from './work-orders.service';

/** Contractors, crews, rate cards and work orders (PRD 3.13). */
@Module({
  controllers: [ContractorsController],
  providers: [
    ContractorsService,
    ContractorCrewService,
    WorkOrdersService,
    WorkOrderAdjustmentsService,
  ],
})
export class ContractorsModule {}
