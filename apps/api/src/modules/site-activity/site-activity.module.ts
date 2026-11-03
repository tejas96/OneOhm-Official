import { Module } from '@nestjs/common';
import { SiteActivityController } from './site-activity.controller';
import { SitePinService } from './site-pin.service';
import { SiteVisitsService } from './site-visits.service';
import { TravelClaimsService } from './travel-claims.service';

/** Site check-ins, geotagged photos, travel and its reimbursement (PRD 4.2, 4.3). */
@Module({
  controllers: [SiteActivityController],
  providers: [SiteVisitsService, SitePinService, TravelClaimsService],
})
export class SiteActivityModule {}
