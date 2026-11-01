import { authContract } from './auth.contract';
import { catalogContract } from './catalog.contract';
import { crmContract } from './crm.contract';
import { customerContract } from './customer.contract';
import { documentsContract } from './documents.contract';
import { peopleContract } from './people.contract';
import { projectsContract, tasksContract } from './projects.contract';
import { quotationsContract } from './quotations.contract';
import { reportsContract } from './reports.contract';
import { serviceDeskContract } from './service-desk.contract';

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
};

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
  catalogContract,
  crmContract,
  customerContract,
  documentsContract,
  peopleContract,
  projectsContract,
  quotationsContract,
  reportsContract,
  serviceDeskContract,
  tasksContract,
};
