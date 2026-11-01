import { initContract } from '@ts-rest/core';
import { searchQuerySchema, searchResultSchema } from '../schemas/search.schema';

const c = initContract();

/**
 * One search over the records a person may open (PRD 10): projects, customers, leads,
 * quotations, tasks, payments (receipt numbers), service requests, documents,
 * contractors and vendors. Resellers and crews find only their own.
 */
export const searchContract = c.router({
  search: {
    method: 'GET',
    path: '/search',
    query: searchQuerySchema,
    responses: { 200: searchResultSchema },
    summary: 'Every word must match; names and codes that start with the words come first.',
  },
});
