import { Module } from '@nestjs/common';
import { CompanyAssetsService } from './company-assets.service';
import { DocumentBundleController } from './document-bundle.controller';
import { DocumentBundleService } from './document-bundle.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { ObjectStorageService } from './object-storage.service';

/** Files in object storage: project and customer documents, task evidence, company assets. */
@Module({
  controllers: [DocumentsController, DocumentBundleController],
  providers: [ObjectStorageService, DocumentsService, CompanyAssetsService, DocumentBundleService],
  exports: [CompanyAssetsService, ObjectStorageService],
})
export class DocumentsModule {}
