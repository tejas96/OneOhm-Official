import { Global, Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CustomerActivityService } from './customer-activity.service';
import { CustomersService } from './customers.service';
import { LeadsService } from './leads.service';

@Global()
@Module({
  controllers: [CrmController],
  providers: [LeadsService, CustomersService, CustomerActivityService],
  exports: [CustomersService, LeadsService],
})
export class CrmModule {}
