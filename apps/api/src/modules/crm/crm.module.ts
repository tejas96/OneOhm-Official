import { Global, Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CustomersService } from './customers.service';
import { LeadsService } from './leads.service';

@Global()
@Module({
  controllers: [CrmController],
  providers: [LeadsService, CustomersService],
  exports: [CustomersService, LeadsService],
})
export class CrmModule {}
