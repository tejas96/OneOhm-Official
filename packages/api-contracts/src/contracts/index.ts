import { auditContract } from './audit.contract';
import { authContract } from './auth.contract';
import { billingContract, customerBillingContract } from './billing.contract';
import { catalogContract } from './catalog.contract';
import { contractorsContract } from './contractors.contract';
import { crmContract } from './crm.contract';
import { customerContract } from './customer.contract';
import { discomContract } from './discom.contract';
import { documentBundleContract } from './document-bundle.contract';
import { documentChecklistContract } from './document-checklist.contract';
import { documentsContract } from './documents.contract';
import { financeContract } from './finance.contract';
import { inventoryContract } from './inventory.contract';
import { notificationsContract } from './notifications.contract';
import { paymentLinksContract } from './payment-links.contract';
import { paymentPlansContract } from './payment-plans.contract';
import { peopleContract } from './people.contract';
import { projectsContract, tasksContract } from './projects.contract';
import { quotationsContract } from './quotations.contract';
import { reportsContract } from './reports.contract';
import { rewardsContract } from './rewards.contract';
import { serviceDeskContract } from './service-desk.contract';
import { teamLoadContract } from './team-load.contract';
import { templatesContract } from './templates.contract';
import { whatsappContract } from './whatsapp.contract';
import { workforceContract } from './workforce.contract';

/**
 * The whole public API as module contracts. Each app assembles the router with
 * `initContract().router(apiRouterDefinition, apiContractOptions)`.
 */
export type ApiRouterDefinition = {
  readonly auth: typeof authContract;
  readonly people: typeof peopleContract;
  readonly catalog: typeof catalogContract;
  readonly crm: typeof crmContract;
  readonly customer: typeof customerContract;
  readonly quotations: typeof quotationsContract;
  readonly projects: typeof projectsContract;
  readonly tasks: typeof tasksContract;
  readonly reports: typeof reportsContract;
  readonly documents: typeof documentsContract;
  readonly serviceDesk: typeof serviceDeskContract;
  readonly inventory: typeof inventoryContract;
  readonly finance: typeof financeContract;
  readonly billing: typeof billingContract;
  readonly customerBilling: typeof customerBillingContract;
  readonly contractors: typeof contractorsContract;
  readonly discom: typeof discomContract;
  readonly workforce: typeof workforceContract;
  readonly rewards: typeof rewardsContract;
  readonly notifications: typeof notificationsContract;
  readonly paymentLinks: typeof paymentLinksContract;
  readonly whatsapp: typeof whatsappContract;
  readonly templates: typeof templatesContract;
  readonly audit: typeof auditContract;
  readonly paymentPlans: typeof paymentPlansContract;
  readonly documentChecklist: typeof documentChecklistContract;
  readonly documentBundle: typeof documentBundleContract;
  readonly teamLoad: typeof teamLoadContract;
};

export const apiRouterDefinition: ApiRouterDefinition = {
  auth: authContract,
  people: peopleContract,
  catalog: catalogContract,
  crm: crmContract,
  customer: customerContract,
  quotations: quotationsContract,
  projects: projectsContract,
  tasks: tasksContract,
  reports: reportsContract,
  documents: documentsContract,
  serviceDesk: serviceDeskContract,
  inventory: inventoryContract,
  finance: financeContract,
  billing: billingContract,
  customerBilling: customerBillingContract,
  contractors: contractorsContract,
  discom: discomContract,
  workforce: workforceContract,
  rewards: rewardsContract,
  notifications: notificationsContract,
  paymentLinks: paymentLinksContract,
  whatsapp: whatsappContract,
  templates: templatesContract,
  audit: auditContract,
  paymentPlans: paymentPlansContract,
  documentChecklist: documentChecklistContract,
  documentBundle: documentBundleContract,
  teamLoad: teamLoadContract,
};

export { type ContractorInput, contractorInputSchema } from './contractors.contract';
export { type PropertyInput, propertyInputSchema } from './crm.contract';
export {
  REPORT_KEYS,
  type ReportKey,
  type ReportOverview,
  reportKeySchema,
  reportOverviewSchema,
} from './reports.contract';
export {
  authContract,
  billingContract,
  catalogContract,
  contractorsContract,
  crmContract,
  customerBillingContract,
  customerContract,
  discomContract,
  documentsContract,
  financeContract,
  inventoryContract,
  peopleContract,
  projectsContract,
  quotationsContract,
  reportsContract,
  rewardsContract,
  serviceDeskContract,
  tasksContract,
  workforceContract,
};
