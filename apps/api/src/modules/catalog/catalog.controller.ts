import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CatalogService } from './catalog.service';
import { CatalogAdminService } from './catalog-admin.service';

@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly admin: CatalogAdminService,
  ) {}

  @TsRestHandler(apiContract.catalog)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.catalog, {
      listProducts: async ({ query }) => {
        if (query.includeInactive) {
          assertCan(actor, 'settings.manage');
          return { status: 200, body: await this.admin.allProducts() };
        }
        return { status: 200, body: await this.catalog.products(query.category) };
      },
      createProduct: async ({ body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 201, body: await this.admin.createProduct(actor, body) };
      },
      updateProduct: async ({ params, body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.admin.updateProduct(actor, params.id, body) };
      },
      listDiscoms: async () => ({ status: 200, body: await this.catalog.discoms() }),
      createDiscom: async ({ body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 201, body: await this.admin.createDiscom(actor, body) };
      },
      updateDiscom: async ({ params, body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.admin.updateDiscom(actor, params.id, body) };
      },
      getRateCard: async () => {
        assertCan(actor, 'settings.manage', 'quotations.create');
        return { status: 200, body: await this.admin.rateCard() };
      },
      updateRateCard: async ({ body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.admin.updateRateCard(actor, body) };
      },
      listSubsidyRules: async () => ({ status: 200, body: await this.admin.subsidyRules() }),
      getCompany: async () => ({ status: 200, body: await this.catalog.company() }),
      updateCompany: async ({ body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.catalog.updateCompany(actor, body) };
      },
    });
  }
}
