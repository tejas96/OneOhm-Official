import { Module } from '@nestjs/common';
import { CommissionEntriesService } from './commission-entries.service';
import { CommissionRulesService } from './commission-rules.service';
import { CommissionsController } from './commissions.controller';
import { PayoutDetailsService } from './payout-details.service';
import { ResellerPerformanceService } from './reseller-performance.service';
import { ResellerPortalService } from './reseller-portal.service';

/** Reseller commission (PRD 4.8, 3.3): rules, earned entries, payouts and performance. */
@Module({
  controllers: [CommissionsController],
  providers: [
    CommissionRulesService,
    CommissionEntriesService,
    PayoutDetailsService,
    ResellerPerformanceService,
    ResellerPortalService,
  ],
})
export class CommissionsModule {}
