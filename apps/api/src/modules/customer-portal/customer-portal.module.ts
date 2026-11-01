import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { CustomerController } from './customer.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerPortalService } from './customer-portal.service';

/** The customer app: OTP sign-in, the project journey, referrals, service and feedback. */
@Module({
  imports: [ReportsModule],
  controllers: [CustomerController],
  providers: [CustomerAuthService, CustomerPortalService],
})
export class CustomerPortalModule {}
