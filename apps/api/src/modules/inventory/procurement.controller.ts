import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { PurchaseOrdersService } from './purchase-orders.service';
import { ReceivingService } from './receiving.service';
import { VendorsService } from './vendors.service';

/** Anyone who works with stock may look; procurement buys; the store receives. */
export const VIEW_INVENTORY = [
  'inventory.view',
  'inventory.manage',
  'procurement.manage',
  'dispatch.manage',
] as const;

@Controller()
export class ProcurementController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly orders: PurchaseOrdersService,
    private readonly receiving: ReceivingService,
  ) {}

  @TsRestHandler(apiContract.inventory.vendors)
  vendorHandler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.inventory.vendors, {
      list: async () => {
        assertCan(actor, ...VIEW_INVENTORY);
        return { status: 200, body: await this.vendors.list(actor) };
      },
      create: async ({ body }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 201, body: await this.vendors.create(actor, body) };
      },
      update: async ({ params, body }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 200, body: await this.vendors.update(actor, params.id, body) };
      },
    });
  }

  @TsRestHandler(apiContract.inventory.purchaseOrders)
  orderHandler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.inventory.purchaseOrders, {
      list: async ({ query }) => {
        assertCan(actor, ...VIEW_INVENTORY, 'projects.view_all');
        return { status: 200, body: await this.orders.list(query) };
      },
      get: async ({ params }) => {
        assertCan(actor, ...VIEW_INVENTORY, 'projects.view_all');
        return { status: 200, body: await this.orders.get(params.id) };
      },
      create: async ({ body }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 201, body: await this.orders.create(actor, body) };
      },
      send: async ({ params }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 200, body: await this.orders.send(actor, params.id) };
      },
      cancel: async ({ params }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 200, body: await this.orders.cancel(actor, params.id) };
      },
      close: async ({ params }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 200, body: await this.orders.close(actor, params.id) };
      },
      receive: async ({ params, body }) => {
        assertCan(actor, 'inventory.manage', 'procurement.manage');
        return { status: 201, body: await this.receiving.receive(actor, params.id, body) };
      },
    });
  }
}
