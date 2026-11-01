import { authContract } from './auth.contract';
import { catalogContract } from './catalog.contract';
import { crmContract } from './crm.contract';
import { peopleContract } from './people.contract';
import { projectsContract, tasksContract } from './projects.contract';
import { quotationsContract } from './quotations.contract';

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
};

export const apiRouterDefinition: ApiRouterDefinition = {
  auth: authContract,
  people: peopleContract,
  catalog: catalogContract,
  crm: crmContract,
  quotations: quotationsContract,
  projects: projectsContract,
  tasks: tasksContract,
};

export { type PropertyInput, propertyInputSchema } from './crm.contract';
export {
  authContract,
  catalogContract,
  crmContract,
  peopleContract,
  projectsContract,
  quotationsContract,
  tasksContract,
};
