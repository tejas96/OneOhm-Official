import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { CustomerController } from './customer.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerDocumentRequestsController } from './customer-document-requests.controller';
import { CustomerDocumentRequestsService } from './customer-document-requests.service';
import { CustomerDocumentsService } from './customer-documents.service';
import { CustomerFamilyController } from './customer-family.controller';
import { CustomerFamilyService } from './customer-family.service';
import {
  CustomerAppLanguageController,
  CustomerLanguageController,
} from './customer-language.controller';
import { CustomerLanguageService } from './customer-language.service';
import { CustomerNotificationsController } from './customer-notifications.controller';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerRequestPhotosService } from './customer-request-photos.service';
import { CustomerUploadsController } from './customer-uploads.controller';
import { CustomerStageRatingsController, StageRatingsController } from './stage-ratings.controller';
import { StageRatingsService } from './stage-ratings.service';

/** The customer app: OTP sign-in, the journey, documents, referrals, service and feedback. */
@Module({
  imports: [ReportsModule, DocumentsModule, NotificationsModule],
  controllers: [
    CustomerController,
    CustomerUploadsController,
    CustomerNotificationsController,
    CustomerDocumentRequestsController,
    CustomerStageRatingsController,
    StageRatingsController,
    CustomerFamilyController,
    CustomerAppLanguageController,
    CustomerLanguageController,
  ],
  providers: [
    CustomerAuthService,
    CustomerPortalService,
    CustomerDocumentsService,
    CustomerRequestPhotosService,
    CustomerDocumentRequestsService,
    StageRatingsService,
    CustomerFamilyService,
    CustomerLanguageService,
  ],
  exports: [CustomerPortalService, CustomerDocumentsService, CustomerAuthService],
})
export class CustomerPortalModule {}
