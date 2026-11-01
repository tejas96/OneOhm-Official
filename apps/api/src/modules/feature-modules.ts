import { CatalogModule } from './catalog/catalog.module';
import { ContractorsModule } from './contractors/contractors.module';
import { CrmModule } from './crm/crm.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { DiscomModule } from './discom/discom.module';
import { DocumentsModule } from './documents/documents.module';
import { FinanceModule } from './finance/finance.module';
import { InventoryModule } from './inventory/inventory.module';
import { PeopleModule } from './people/people.module';
import { ProjectsModule } from './projects/projects.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ServiceDeskModule } from './service-desk/service-desk.module';

/** Every business module the API serves, in one list. */
export const FEATURE_MODULES = [
  CatalogModule,
  PeopleModule,
  CrmModule,
  DocumentsModule,
  InventoryModule,
  QuotationsModule,
  ProjectsModule,
  CustomerPortalModule,
  ServiceDeskModule,
  FinanceModule,
  ContractorsModule,
  DiscomModule,
];
