import { Module } from '@nestjs/common';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { AfterSalesController, CustomerAfterSalesController } from './after-sales.controller';
import { AfterSalesSettingsService } from './after-sales-settings.service';
import { CustomerAfterSalesService } from './customer-after-sales.service';
import { ProjectAfterSalesService } from './project-after-sales.service';

/**
 * After-sales (PRD 3.17, 5.5, 7.2): installed assets and warranties, AMC plans and
 * contracts with their planned visits, service categories and their hours, and ratings.
 */
@Module({
  imports: [CustomerPortalModule],
  controllers: [AfterSalesController, CustomerAfterSalesController],
  providers: [AfterSalesSettingsService, ProjectAfterSalesService, CustomerAfterSalesService],
  exports: [CustomerAfterSalesService],
})
export class AfterSalesModule {}
