import { apiContractOptions, apiRouterDefinition } from '@oneohm/api-contracts';
import { initContract } from '@ts-rest/core';

export const apiContract = initContract().router(apiRouterDefinition, apiContractOptions);
export const SESSION_COOKIE = 'oneohm_session';
export const CSRF_COOKIE = 'oneohm_csrf';
export const CSRF_HEADER = 'x-oneohm-csrf';
