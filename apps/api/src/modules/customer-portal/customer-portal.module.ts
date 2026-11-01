import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { CustomerController } from './customer.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerDocumentsService } from './customer-documents.service';
import { CustomerNotificationsController } from './customer-notifications.controller';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerRequestPhotosService } from './customer-request-photos.service';
import { CustomerUploadsController } from './customer-uploads.controller';

/** The customer app: OTP sign-in, the journey, documents, referrals, service and feedback. */
@Module({
  imports: [ReportsModule, DocumentsModule, NotificationsModule],
  controllers: [CustomerController, CustomerUploadsController, CustomerNotificationsController],
  providers: [
    CustomerAuthService,
    CustomerPortalService,
    CustomerDocumentsService,
    CustomerRequestPhotosService,
  ],
})
export class CustomerPortalModule {}
