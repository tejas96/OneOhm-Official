import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerActivityService } from './customer-activity.service';
import { CustomersService } from './customers.service';
import { LeadsService } from './leads.service';

@Controller()
export class CrmController {
  constructor(
    private readonly leads: LeadsService,
    private readonly customers: CustomersService,
    private readonly activity: CustomerActivityService,
  ) {}

  @TsRestHandler(apiContract.crm)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.crm, {
      listLeads: async ({ query }) => ({ status: 200, body: await this.leads.list(actor, query) }),
      createLead: async ({ body }) => {
        assertCan(actor, 'leads.manage');
        return { status: 201, body: await this.leads.create(actor, body) };
      },
      getLead: async ({ params }) => ({
        status: 200,
        body: await this.leads.get(actor, params.id),
      }),
      updateLead: async ({ params, body }) => {
        assertCan(actor, 'leads.manage');
        return { status: 200, body: await this.leads.update(actor, params.id, body) };
      },
      addLeadActivity: async ({ params, body }) => {
        assertCan(actor, 'leads.manage');
        return {
          status: 201,
          body: await this.leads.addActivity(actor, params.id, body.kind, body.note),
        };
      },
      convertLead: async ({ params, body }) => {
        assertCan(actor, 'customers.manage', 'quotations.create');
        return {
          status: 201,
          body: await this.customers.convertLead(actor, params.id, body.kind, body.property),
        };
      },
      listCustomers: async ({ query }) => {
        assertCan(actor, 'customers.view');
        return { status: 200, body: await this.customers.list(query.search) };
      },
      getCustomer: async ({ params }) => {
        assertCan(actor, 'customers.view');
        return { status: 200, body: await this.customers.get(params.id) };
      },
      getCustomerActivity: async ({ params }) => {
        assertCan(actor, 'customers.view');
        return { status: 200, body: await this.activity.get(params.id) };
      },
      getProperty: async ({ params }) => {
        assertCan(actor, 'customers.view', 'quotations.create');
        return { status: 200, body: await this.customers.propertyWithCustomer(params.id) };
      },
      updateProperty: async ({ params, body }) => {
        assertCan(actor, 'customers.manage', 'surveys.perform', 'discom.manage');
        return { status: 200, body: await this.customers.updateProperty(actor, params.id, body) };
      },
    });
  }
}
