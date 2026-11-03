import { Global, Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CustomerActivityService } from './customer-activity.service';
import { CustomerContactController } from './customer-contact.controller';
import { CustomerContactService } from './customer-contact.service';
import { CustomersService } from './customers.service';
import { LeadCampaignsController } from './lead-campaigns.controller';
import { LeadCampaignsService } from './lead-campaigns.service';
import { PhoneMatchController, WebsiteLeadController } from './lead-intake.controller';
import { LeadIntakeService } from './lead-intake.service';
import { LeadStepsController } from './lead-steps.controller';
import { LeadStepsService } from './lead-steps.service';
import { LeadsService } from './leads.service';
import { SalesChecksController } from './sales-checks.controller';
import { SalesChecksService } from './sales-checks.service';
import { SiteConnectionController } from './site-connection.controller';
import { SiteConnectionService } from './site-connection.service';

@Global()
@Module({
  controllers: [
    CrmController,
    LeadStepsController,
    LeadCampaignsController,
    CustomerContactController,
    PhoneMatchController,
    WebsiteLeadController,
    SiteConnectionController,
    SalesChecksController,
  ],
  providers: [
    LeadsService,
    CustomersService,
    CustomerActivityService,
    LeadStepsService,
    LeadCampaignsService,
    CustomerContactService,
    LeadIntakeService,
    SiteConnectionService,
    SalesChecksService,
  ],
  exports: [CustomersService, LeadsService, LeadIntakeService],
})
export class CrmModule {}
