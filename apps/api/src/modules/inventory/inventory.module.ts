import { Module } from '@nestjs/common';
import { MaterialService } from './material.service';
import { ProcurementController } from './procurement.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { ReceivingService } from './receiving.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { VendorsService } from './vendors.service';

/** Inventory, procurement, vendors and dispatch (PRD 3.10). */
@Module({
  controllers: [ProcurementController, StockController],
  providers: [
    VendorsService,
    PurchaseOrdersService,
    ReceivingService,
    StockService,
    MaterialService,
  ],
})
export class InventoryModule {}
