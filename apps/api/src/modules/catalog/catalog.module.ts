import { Global, Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogAdminService } from './catalog-admin.service';
import { ProductDatasheetController } from './product-datasheet.controller';
import { ProductDatasheetService } from './product-datasheet.service';
import { SubsidyImpactService } from './subsidy-impact.service';
import { SubsidyRulesService } from './subsidy-rules.service';

@Global()
@Module({
  imports: [DocumentsModule],
  controllers: [CatalogController, ProductDatasheetController],
  providers: [
    CatalogService,
    CatalogAdminService,
    SubsidyRulesService,
    SubsidyImpactService,
    ProductDatasheetService,
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
