import { Global, Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogAdminService } from './catalog-admin.service';
import { SubsidyImpactService } from './subsidy-impact.service';
import { SubsidyRulesService } from './subsidy-rules.service';

@Global()
@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogAdminService, SubsidyRulesService, SubsidyImpactService],
  exports: [CatalogService],
})
export class CatalogModule {}
