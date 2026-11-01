import { Module } from '@nestjs/common';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { BankPayoutsController } from './bank-payouts.controller';
import { BankPayoutsService } from './bank-payouts.service';
import { createPayoutGateway, PAYOUT_GATEWAY } from './payout-gateway';
import { PayoutSyncService } from './payout-sync.service';

/** Bank transfers of approved bills through RazorpayX (PRD 3.11). */
@Module({
  controllers: [BankPayoutsController],
  providers: [
    BankPayoutsService,
    PayoutSyncService,
    {
      provide: PAYOUT_GATEWAY,
      inject: [ENVIRONMENT],
      useFactory: (env: Environment) => createPayoutGateway(env),
    },
  ],
  exports: [PayoutSyncService],
})
export class BankPayoutsModule {}
