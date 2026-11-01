import { Module } from '@nestjs/common';
import { CompanyAssetsService } from './company-assets.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { ObjectStorageService } from './object-storage.service';

/** Files in object storage: project and customer documents, task evidence, company assets. */
@Module({
  controllers: [DocumentsController],
  providers: [ObjectStorageService, DocumentsService, CompanyAssetsService],
  exports: [CompanyAssetsService],
})
export class DocumentsModule {}
