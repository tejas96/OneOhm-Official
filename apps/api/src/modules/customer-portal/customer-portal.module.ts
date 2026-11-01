import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { ReportsModule } from '../reports/reports.module';
import { CustomerController } from './customer.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerDocumentsService } from './customer-documents.service';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerRequestPhotosService } from './customer-request-photos.service';
import { CustomerUploadsController } from './customer-uploads.controller';

/** The customer app: OTP sign-in, the journey, documents, referrals, service and feedback. */
@Module({
  imports: [ReportsModule, DocumentsModule],
  controllers: [CustomerController, CustomerUploadsController],
  providers: [
    CustomerAuthService,
    CustomerPortalService,
    CustomerDocumentsService,
    CustomerRequestPhotosService,
  ],
})
export class CustomerPortalModule {}
