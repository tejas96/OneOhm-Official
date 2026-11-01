import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { ServiceFilesService } from './service-files.service';
import { ServiceFinishService } from './service-finish.service';
import { ServiceVisitsController } from './service-visits.controller';
import { ServiceVisitsService } from './service-visits.service';

/** Service visits from the field app: check-in, evidence, done or handed back (PRD 5.5). */
@Module({
  imports: [DocumentsModule],
  controllers: [ServiceVisitsController],
  providers: [ServiceVisitsService, ServiceFinishService, ServiceFilesService],
})
export class ServiceVisitsModule {}
