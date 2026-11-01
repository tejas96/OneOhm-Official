import { Global, Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CustomerActivityService } from './customer-activity.service';
import { CustomerContactController } from './customer-contact.controller';
import { CustomerContactService } from './customer-contact.service';
import { CustomersService } from './customers.service';
import { PhoneMatchController, WebsiteLeadController } from './lead-intake.controller';
import { LeadIntakeService } from './lead-intake.service';
import { LeadStepsController } from './lead-steps.controller';
import { LeadStepsService } from './lead-steps.service';
import { LeadsService } from './leads.service';
import { SiteConnectionController } from './site-connection.controller';
import { SiteConnectionService } from './site-connection.service';

@Global()
@Module({
  controllers: [
    CrmController,
    LeadStepsController,
    CustomerContactController,
    PhoneMatchController,
    WebsiteLeadController,
    SiteConnectionController,
  ],
  providers: [
    LeadsService,
    CustomersService,
    CustomerActivityService,
    LeadStepsService,
    CustomerContactService,
    LeadIntakeService,
    SiteConnectionService,
  ],
  exports: [CustomersService, LeadsService, LeadIntakeService],
})
export class CrmModule {}
