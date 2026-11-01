import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { CustodyController } from './custody.controller';
import { CustodyService } from './custody.service';
import { CustodyPhotoService } from './custody-photo.service';
import { MaterialService } from './material.service';
import { ProcurementController } from './procurement.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { ReceivingService } from './receiving.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { VendorsService } from './vendors.service';

/** Inventory, procurement, vendors, dispatch and material with contractors (PRD 3.10). */
@Module({
  imports: [DocumentsModule],
  controllers: [ProcurementController, StockController, CustodyController],
  providers: [
    VendorsService,
    PurchaseOrdersService,
    ReceivingService,
    StockService,
    MaterialService,
    CustodyService,
    CustodyPhotoService,
  ],
  exports: [VendorsService],
})
export class InventoryModule {}
