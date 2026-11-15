import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ServiceVisitsModule } from '../service-visits/service-visits.module';
import { DutySitesService } from './duty-sites.service';
import { RouteVisitsService } from './route-visits.service';
import { SiteActivityController } from './site-activity.controller';
import { SitePinService } from './site-pin.service';
import { SiteVisitsService } from './site-visits.service';
import { TravelClaimsService } from './travel-claims.service';

/** Site check-ins, geotagged photos, travel and its reimbursement (PRD 4.2, 4.3). */
@Module({
  imports: [ProjectsModule, ServiceVisitsModule],
  controllers: [SiteActivityController],
  providers: [
    SiteVisitsService,
    SitePinService,
    TravelClaimsService,
    DutySitesService,
    RouteVisitsService,
  ],
  exports: [RouteVisitsService],
})
export class SiteActivityModule {}
