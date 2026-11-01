import { Global, Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CustomerActivityService } from './customer-activity.service';
import { CustomersService } from './customers.service';
import { LeadStepsController } from './lead-steps.controller';
import { LeadStepsService } from './lead-steps.service';
import { LeadsService } from './leads.service';

@Global()
@Module({
  controllers: [CrmController, LeadStepsController],
  providers: [LeadsService, CustomersService, CustomerActivityService, LeadStepsService],
  exports: [CustomersService, LeadsService],
})
export class CrmModule {}
