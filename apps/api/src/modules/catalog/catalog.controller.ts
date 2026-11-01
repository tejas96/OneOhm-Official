import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @TsRestHandler(apiContract.catalog)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.catalog, {
      listProducts: async ({ query }) => ({
        status: 200,
        body: await this.catalog.products(query.category),
      }),
      listDiscoms: async () => ({ status: 200, body: await this.catalog.discoms() }),
      getCompany: async () => ({ status: 200, body: await this.catalog.company() }),
      updateCompany: async ({ body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.catalog.updateCompany(actor, body) };
      },
    });
  }
}
