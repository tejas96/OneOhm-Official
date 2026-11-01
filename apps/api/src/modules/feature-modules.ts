import { CatalogModule } from './catalog/catalog.module';
import { ContractorsModule } from './contractors/contractors.module';
import { CrmModule } from './crm/crm.module';
import { DiscomModule } from './discom/discom.module';
import { PeopleModule } from './people/people.module';
import { ProjectsModule } from './projects/projects.module';
import { QuotationsModule } from './quotations/quotations.module';

/** Every business module the API serves, in one list. */
export const FEATURE_MODULES = [
  CatalogModule,
  PeopleModule,
  CrmModule,
  QuotationsModule,
  ProjectsModule,
  ContractorsModule,
  DiscomModule,
];
