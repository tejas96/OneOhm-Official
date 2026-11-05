import { Module } from '@nestjs/common';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { LocationReviewService } from './location-review.service';
import { SendToCustomerController } from './send-to-customer.controller';
import { SendToCustomerService } from './send-to-customer.service';

/** The staff "Send to customer" menu and the check of locations customers send (redesign §18). */
@Module({
  imports: [CustomerPortalModule],
  controllers: [SendToCustomerController],
  providers: [SendToCustomerService, LocationReviewService],
})
export class SendToCustomerModule {}
