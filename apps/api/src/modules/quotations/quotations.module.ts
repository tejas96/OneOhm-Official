import { Global, Module } from '@nestjs/common';
import { QuotationPricingService } from './quotation-pricing.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Global()
@Module({
  controllers: [QuotationsController],
  providers: [QuotationPricingService, QuotationsService],
  exports: [QuotationsService, QuotationPricingService],
})
export class QuotationsModule {}
