import { AfterSalesModule } from './after-sales/after-sales.module';
import { AuditModule } from './audit/audit.module';
import { BankPayoutsModule } from './bank-payouts/bank-payouts.module';
import { BusinessReportsModule } from './business-reports/business-reports.module';
import { BusinessSettingsModule } from './business-settings/business-settings.module';
import { CatalogModule } from './catalog/catalog.module';
import { CommissionsModule } from './commissions/commissions.module';
import { ContractorsModule } from './contractors/contractors.module';
import { CrmModule } from './crm/crm.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { DiscomModule } from './discom/discom.module';
import { DocumentsModule } from './documents/documents.module';
import { FinanceModule } from './finance/finance.module';
import { InventoryModule } from './inventory/inventory.module';
import { ListsModule } from './lists/lists.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GatewayModule } from './online-payments/gateway.module';
import { OnlinePaymentsModule } from './online-payments/online-payments.module';
import { PaymentPlansModule } from './payment-plans/payment-plans.module';
import { PeopleModule } from './people/people.module';
import { ProjectChangesModule } from './project-changes/project-changes.module';
import { ProjectsModule } from './projects/projects.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ReferralsModule } from './referrals/referrals.module';
import { SearchModule } from './search/search.module';
import { ServiceDeskModule } from './service-desk/service-desk.module';
import { ServiceVisitsModule } from './service-visits/service-visits.module';
import { SiteActivityModule } from './site-activity/site-activity.module';
import { StateSupportModule } from './state-support/state-support.module';
import { SystemPapersModule } from './system-papers/system-papers.module';
import { TemplatesModule } from './templates/templates.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { WorkforceModule } from './workforce/workforce.module';

/** Every business module the API serves, in one list. */
export const FEATURE_MODULES = [
  CatalogModule,
  PeopleModule,
  CrmModule,
  DocumentsModule,
  InventoryModule,
  PurchasingModule,
  QuotationsModule,
  ProjectsModule,
  CustomerPortalModule,
  ServiceDeskModule,
  ServiceVisitsModule,
  AfterSalesModule,
  FinanceModule,
  ContractorsModule,
  DiscomModule,
  WorkforceModule,
  SiteActivityModule,
  NotificationsModule,
  GatewayModule,
  OnlinePaymentsModule,
  WhatsAppModule,
  TemplatesModule,
  AuditModule,
  BankPayoutsModule,
  BusinessReportsModule,
  PaymentPlansModule,
  ReferralsModule,
  CommissionsModule,
  SystemPapersModule,
  BusinessSettingsModule,
  ListsModule,
  SearchModule,
  ProjectChangesModule,
  StateSupportModule,
];
