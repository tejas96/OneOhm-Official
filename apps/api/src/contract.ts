import { apiContractOptions, apiRouterDefinition } from '@oneohm/api-contracts';
import { initContract } from '@ts-rest/core';

/** The assembled ts-rest router served by this API. */
export const apiContract = initContract().router(apiRouterDefinition, apiContractOptions);
