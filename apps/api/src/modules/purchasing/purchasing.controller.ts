import { Controller } from '@nestjs/common';
import type { Capability } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { VIEW_INVENTORY } from '../inventory/procurement.controller';
import { PurchaseRequestsService } from './purchase-requests.service';
import { VendorAdvancesService } from './vendor-advances.service';
import { VendorPerformanceService } from './vendor-performance.service';

/** Anyone with inventory, procurement or project rights may ask for material. */
const RAISE: readonly Capability[] = [...VIEW_INVENTORY, 'projects.manage'];
const SEE_ADVANCES: readonly Capability[] = [
  'finance.view',
  'finance.record_payments',
  'finance.approve_payments',
  'procurement.manage',
];

@Controller()
export class PurchasingController {
  constructor(
    private readonly requests: PurchaseRequestsService,
    private readonly advances: VendorAdvancesService,
    private readonly performance: VendorPerformanceService,
  ) {}

  @TsRestHandler(apiContract.purchasing.requests)
  requestHandler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.purchasing.requests, {
      list: async ({ query }) => {
        assertCan(actor, ...RAISE);
        return { status: 200, body: await this.requests.list(query) };
      },
      get: async ({ params }) => {
        assertCan(actor, ...RAISE);
        return { status: 200, body: await this.requests.get(params.id) };
      },
      create: async ({ body }) => {
        assertCan(actor, ...RAISE);
        return { status: 201, body: await this.requests.create(actor, body) };
      },
      approve: async ({ params, body }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 200, body: await this.requests.approve(actor, params.id, body.note) };
      },
      reject: async ({ params, body }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 200, body: await this.requests.reject(actor, params.id, body.note) };
      },
      cancel: async ({ params }) => {
        assertCan(actor, ...RAISE);
        return { status: 200, body: await this.requests.cancel(actor, params.id) };
      },
      order: async ({ params, body }) => {
        assertCan(actor, 'procurement.manage');
        return { status: 201, body: await this.requests.order(actor, params.id, body) };
      },
    });
  }

  @TsRestHandler(apiContract.purchasing.advances)
  advanceHandler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.purchasing.advances, {
      list: async ({ query }) => {
        assertCan(actor, ...SEE_ADVANCES);
        return { status: 200, body: await this.advances.list(query) };
      },
      create: async ({ body }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 201, body: await this.advances.create(actor, body) };
      },
      approve: async ({ params }) => {
        assertCan(actor, 'finance.approve_payments');
        return { status: 200, body: await this.advances.approve(actor, params.id) };
      },
      pay: async ({ params, body }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 200, body: await this.advances.pay(actor, params.id, body) };
      },
      cancel: async ({ params }) => {
        assertCan(actor, 'finance.record_payments', 'finance.approve_payments');
        return { status: 200, body: await this.advances.cancel(actor, params.id) };
      },
    });
  }

  @TsRestHandler(apiContract.purchasing.vendorPerformance)
  performanceHandler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.purchasing.vendorPerformance, {
      scorecards: async () => {
        assertCan(actor, ...VIEW_INVENTORY, ...SEE_ADVANCES);
        return { status: 200, body: await this.performance.scorecards() };
      },
      profile: async ({ params }) => {
        assertCan(actor, ...VIEW_INVENTORY, ...SEE_ADVANCES);
        return { status: 200, body: await this.performance.profile(actor, params.id) };
      },
    });
  }
}
