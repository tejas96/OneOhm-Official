import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CommissionEntriesService } from './commission-entries.service';
import { CommissionRulesService } from './commission-rules.service';
import { ResellerPerformanceService } from './reseller-performance.service';
import { ResellerPortalService } from './reseller-portal.service';

/** Reseller commission: rules, finance's approvals and payouts, and the reseller's own view. */
@Controller()
export class CommissionsController {
  constructor(
    private readonly rules: CommissionRulesService,
    private readonly entries: CommissionEntriesService,
    private readonly performance: ResellerPerformanceService,
    private readonly portal: ResellerPortalService,
  ) {}

  @TsRestHandler(apiContract.commissions)
  handler(@CurrentActor() actor: Actor) {
    const oversee = () => assertCan(actor, 'finance.view', 'settings.manage', 'people.view');
    return tsRestHandler(apiContract.commissions, {
      performance: async () => {
        oversee();
        return { status: 200, body: await this.performance.list() };
      },
      defaultRule: async () => {
        oversee();
        return { status: 200, body: await this.rules.defaultRule() };
      },
      saveDefaultRule: async ({ body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.rules.saveDefault(actor, body) };
      },
      saveResellerRule: async ({ params, body }) => {
        assertCan(actor, 'settings.manage');
        return {
          status: 200,
          body: await this.rules.saveForReseller(actor, params.resellerId, body),
        };
      },
      clearResellerRule: async ({ params }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.rules.clearForReseller(actor, params.resellerId) };
      },
      listEntries: async ({ query }) => {
        assertCan(actor, 'finance.view', 'finance.record_payments');
        return { status: 200, body: await this.entries.list(query) };
      },
      approveEntry: async ({ params }) => {
        assertCan(actor, 'finance.approve_payments');
        return { status: 200, body: await this.entries.approve(actor, params.id) };
      },
      rejectEntry: async ({ params, body }) => {
        assertCan(actor, 'finance.approve_payments');
        return { status: 200, body: await this.entries.reject(actor, params.id, body.reason) };
      },
      payEntry: async ({ params, body }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 200, body: await this.entries.pay(actor, params.id, body) };
      },
      myEarnings: async () => {
        assertCan(actor, 'commission.view_own');
        return { status: 200, body: await this.portal.earnings(actor) };
      },
      myCustomers: async () => {
        assertCan(actor, 'commission.view_own');
        return { status: 200, body: await this.portal.customers(actor) };
      },
    });
  }
}
