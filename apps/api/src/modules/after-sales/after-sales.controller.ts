import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor, Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerAuthService, customerSession } from '../customer-portal/customer-auth.service';
import { AfterSalesSettingsService } from './after-sales-settings.service';
import { CustomerAfterSalesService } from './customer-after-sales.service';
import { ProjectAfterSalesService } from './project-after-sales.service';

/** The office side: settings, a project's installed system and its AMCs. */
@Controller()
export class AfterSalesController {
  constructor(
    private readonly settings: AfterSalesSettingsService,
    private readonly projects: ProjectAfterSalesService,
  ) {}

  @TsRestHandler(apiContract.afterSales)
  handler(@CurrentActor() actor: Actor) {
    const settings = () => assertCan(actor, 'settings.manage');
    return tsRestHandler(apiContract.afterSales, {
      listServiceCategories: async () => {
        assertCan(actor, 'settings.manage', 'service.manage');
        return { status: 200, body: await this.settings.categories() };
      },
      createServiceCategory: async ({ body }) => {
        settings();
        return { status: 201, body: await this.settings.createCategory(actor.userId, body) };
      },
      updateServiceCategory: async ({ params, body }) => {
        settings();
        return {
          status: 200,
          body: await this.settings.updateCategory(actor.userId, params.id, body),
        };
      },
      warrantyPolicy: async () => {
        settings();
        return { status: 200, body: await this.settings.warranty() };
      },
      saveWarrantyPolicy: async ({ body }) => {
        settings();
        return { status: 200, body: await this.settings.saveWarranty(actor.userId, body) };
      },
      listAmcPlans: async () => {
        assertCan(actor, 'settings.manage', 'service.manage');
        return { status: 200, body: await this.settings.plans() };
      },
      createAmcPlan: async ({ body }) => {
        settings();
        return { status: 201, body: await this.settings.savePlan(actor.userId, null, body) };
      },
      updateAmcPlan: async ({ params, body }) => {
        settings();
        return { status: 200, body: await this.settings.savePlan(actor.userId, params.id, body) };
      },
      projectAfterSales: async ({ params }) => {
        assertCan(actor, 'projects.view_all', 'service.manage', 'projects.manage');
        return { status: 200, body: await this.projects.read(params.id) };
      },
      recordAssets: async ({ params }) => {
        assertCan(actor, 'service.manage', 'projects.manage');
        return { status: 200, body: await this.projects.record(actor.userId, params.id) };
      },
      updateAsset: async ({ params, body }) => {
        assertCan(actor, 'service.manage', 'projects.manage');
        return {
          status: 200,
          body: await this.projects.updateAsset(actor.userId, params.id, body),
        };
      },
      sellAmc: async ({ params, body }) => {
        assertCan(actor, 'service.manage');
        return { status: 201, body: await this.projects.sellAmc(actor.userId, params.id, body) };
      },
      cancelAmc: async ({ params }) => {
        assertCan(actor, 'service.manage');
        return { status: 200, body: await this.projects.cancelAmc(actor.userId, params.id) };
      },
    });
  }
}

/** The customer app's side; the customer comes from the bearer token, not a staff session. */
@Public()
@Controller()
export class CustomerAfterSalesController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly cover: CustomerAfterSalesService,
  ) {}

  @TsRestHandler(apiContract.customerAfterSales)
  handler(@Req() request: Request) {
    const customer = async () => (await customerSession(this.auth, request)).customerId;
    return tsRestHandler(apiContract.customerAfterSales, {
      cover: async () => ({ status: 200, body: await this.cover.cover(await customer()) }),
      serviceCategories: async () => {
        await customer();
        return { status: 200, body: await this.cover.categories() };
      },
      rateServiceRequest: async ({ params, body }) => ({
        status: 200,
        body: await this.cover.rate(await customer(), params.id, body),
      }),
    });
  }
}
