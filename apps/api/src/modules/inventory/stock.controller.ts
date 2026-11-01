import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { MaterialService } from './material.service';
import { VIEW_INVENTORY } from './procurement.controller';
import { StockService } from './stock.service';

@Controller()
export class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly material: MaterialService,
  ) {}

  @TsRestHandler(apiContract.inventory.stock)
  stockHandler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.inventory.stock, {
      list: async () => {
        assertCan(actor, ...VIEW_INVENTORY);
        return { status: 200, body: await this.stock.list() };
      },
      locations: async () => {
        assertCan(actor, ...VIEW_INVENTORY);
        return { status: 200, body: await this.stock.locations() };
      },
      createLocation: async ({ body }) => {
        assertCan(actor, 'inventory.manage');
        return { status: 201, body: await this.stock.createLocation(actor, body) };
      },
      adjust: async ({ body }) => {
        assertCan(actor, 'inventory.manage');
        return { status: 201, body: await this.stock.adjust(actor, body) };
      },
      setThreshold: async ({ params, body }) => {
        assertCan(actor, 'inventory.manage');
        return {
          status: 200,
          body: await this.stock.setThreshold(actor, params.id, body.minimum),
        };
      },
      movements: async ({ query }) => {
        assertCan(actor, ...VIEW_INVENTORY);
        return { status: 200, body: await this.stock.movements(query) };
      },
      dispatches: async () => {
        assertCan(actor, ...VIEW_INVENTORY);
        return { status: 200, body: await this.stock.dispatches() };
      },
    });
  }

  @TsRestHandler(apiContract.inventory.material)
  materialHandler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.inventory.material, {
      get: async ({ params }) => {
        assertCan(actor, ...VIEW_INVENTORY, 'projects.view_all');
        return { status: 200, body: await this.material.get(params.id) };
      },
      reserve: async ({ params, body }) => {
        assertCan(actor, 'inventory.manage');
        return {
          status: 200,
          body: await this.material.reserve(actor, params.id, body.locationId),
        };
      },
      release: async ({ params }) => {
        assertCan(actor, 'inventory.manage');
        return { status: 200, body: await this.material.release(actor, params.id) };
      },
      dispatch: async ({ params, body }) => {
        assertCan(actor, 'dispatch.manage');
        return { status: 201, body: await this.material.dispatch(actor, params.id, body) };
      },
    });
  }
}
