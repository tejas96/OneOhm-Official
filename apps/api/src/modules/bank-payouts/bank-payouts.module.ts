import { Module } from '@nestjs/common';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { ReportsModule } from '../reports/reports.module';
import { BankHoldService } from './bank-hold.service';
import { BankPayoutsController } from './bank-payouts.controller';
import { BankPayoutsService } from './bank-payouts.service';
import { PayoutAdviceService } from './payout-advice.service';
import { createPayoutGateway, PAYOUT_GATEWAY } from './payout-gateway';
import { PayoutIpService } from './payout-ip.service';
import { PayoutMatchService } from './payout-match.service';
import { PayoutRequestsService } from './payout-requests.service';
import { PayoutSyncService } from './payout-sync.service';

/** Bank transfers of approved bills through RazorpayX (PRD 3.11). */
@Module({
  imports: [ReportsModule],
  controllers: [BankPayoutsController],
  providers: [
    BankPayoutsService,
    PayoutRequestsService,
    BankHoldService,
    PayoutAdviceService,
    PayoutSyncService,
    PayoutIpService,
    PayoutMatchService,
    {
      provide: PAYOUT_GATEWAY,
      inject: [ENVIRONMENT],
      useFactory: (env: Environment) => createPayoutGateway(env),
    },
  ],
  exports: [PayoutSyncService],
})
export class BankPayoutsModule {}
