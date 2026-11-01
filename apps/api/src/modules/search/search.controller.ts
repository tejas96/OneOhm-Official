import { Controller, Inject } from '@nestjs/common';
import type { SearchType } from '@oneohm/api-contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { searchWords } from '../../common/paging';
import { DATABASE, type Database } from '../../config/core.module';
import { apiContract } from '../../contract';
import type { Finder } from './search-hit';
import { findContractors, findVendors } from './search-parties';
import { findCustomers, findLeads, findProjects, findQuotations } from './search-sales';
import { searchableTypes } from './search-scope';
import { findDocuments, findPayments, findServiceRequests, findTasks } from './search-work';

const FINDERS: Readonly<Record<SearchType, Finder>> = {
  projects: findProjects,
  customers: findCustomers,
  leads: findLeads,
  quotations: findQuotations,
  tasks: findTasks,
  payments: findPayments,
  service: findServiceRequests,
  documents: findDocuments,
  contractors: findContractors,
  vendors: findVendors,
};

/**
 * Universal search (PRD 10). Each kind is searched only when the person may open it,
 * and narrowed to their own where their rights are (resellers' leads, crews' tasks).
 */
@Controller()
export class SearchController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @TsRestHandler(apiContract.search)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.search, {
      search: async ({ query }) => {
        const searched = searchableTypes(actor, query.types);
        const context = {
          db: this.db,
          actor,
          words: searchWords(query.q),
          raw: query.q.trim().toLowerCase(),
          limit: query.limit,
        };
        const found = await Promise.all(searched.map((type) => FINDERS[type](context)));
        return { status: 200, body: { hits: found.flat(), searched } };
      },
    });
  }
}
