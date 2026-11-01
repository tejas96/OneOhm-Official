import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PurchasingController } from './purchasing.controller';
import { VendorAdvancesService } from './vendor-advances.service';
import { VendorPerformanceService } from './vendor-performance.service';

/** Purchase requests, vendor advances and vendor performance (PRD 3.10, 3.11). */
@Module({
  imports: [InventoryModule],
  controllers: [PurchasingController],
  providers: [PurchaseRequestsService, VendorAdvancesService, VendorPerformanceService],
})
export class PurchasingModule {}
