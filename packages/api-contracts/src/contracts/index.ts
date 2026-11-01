import { authContract } from './auth.contract';
import { catalogContract } from './catalog.contract';
import { crmContract } from './crm.contract';
import { peopleContract } from './people.contract';
import { projectsContract, tasksContract } from './projects.contract';
import { quotationsContract } from './quotations.contract';
import { reportsContract } from './reports.contract';

/**
 * The whole public API as module contracts. Each app assembles the router with
 * `initContract().router(apiRouterDefinition, apiContractOptions)`.
 */
export type ApiRouterDefinition = {
  readonly auth: typeof authContract;
  readonly people: typeof peopleContract;
  readonly catalog: typeof catalogContract;
  readonly crm: typeof crmContract;
  readonly quotations: typeof quotationsContract;
  readonly projects: typeof projectsContract;
  readonly tasks: typeof tasksContract;
  readonly reports: typeof reportsContract;
};

export const apiRouterDefinition: ApiRouterDefinition = {
  auth: authContract,
  people: peopleContract,
  catalog: catalogContract,
  crm: crmContract,
  quotations: quotationsContract,
  projects: projectsContract,
  tasks: tasksContract,
  reports: reportsContract,
};

export { type PropertyInput, propertyInputSchema } from './crm.contract';
export { REPORT_KEYS, type ReportKey, reportKeySchema } from './reports.contract';
export {
  authContract,
  catalogContract,
  crmContract,
  peopleContract,
  projectsContract,
  quotationsContract,
  reportsContract,
  tasksContract,
};
