import { CatalogModule } from './catalog/catalog.module';
import { CrmModule } from './crm/crm.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { DocumentsModule } from './documents/documents.module';
import { PeopleModule } from './people/people.module';
import { ProjectsModule } from './projects/projects.module';
import { QuotationsModule } from './quotations/quotations.module';

/** Every business module the API serves, in one list. */
export const FEATURE_MODULES = [
  CatalogModule,
  PeopleModule,
  CrmModule,
  DocumentsModule,
  QuotationsModule,
  ProjectsModule,
  CustomerPortalModule,
];
