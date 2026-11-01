import { Module } from '@nestjs/common';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { CustomerReferralsController } from './customer-referrals.controller';
import { IncentiveSweepService } from './incentive-sweep.service';
import { ReferralProgramService } from './referral-program.service';
import { ReferralRewardsService } from './referral-rewards.service';
import { ReferralsController } from './referrals.controller';

/** Refer and earn (PRD 5.6, 7.2): programme settings, codes, rewards and their payment. */
@Module({
  imports: [CustomerPortalModule],
  controllers: [ReferralsController, CustomerReferralsController],
  providers: [ReferralProgramService, ReferralRewardsService, IncentiveSweepService],
})
export class ReferralsModule {}
