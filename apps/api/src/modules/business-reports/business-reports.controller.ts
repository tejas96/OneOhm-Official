import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { BusinessReportsService } from './business-reports.service';

/** The business reports are for the owner and leadership (`dashboard.view_business`). */
@Controller()
export class BusinessReportsController {
  constructor(private readonly reports: BusinessReportsService) {}

  @TsRestHandler(apiContract.businessReports)
  handler(@CurrentActor() actor: Actor) {
    const run = <T>(work: () => Promise<T>) => {
      assertCan(actor, 'dashboard.view_business');
      return work().then((body) => ({ status: 200 as const, body }));
    };
    const r = this.reports;
    return tsRestHandler(apiContract.businessReports, {
      salesReport: ({ query }) => run(() => r.sales.report(query)),
      deliveryReport: ({ query }) => run(() => r.delivery.report(query)),
      delaysReport: ({ query }) => run(() => r.delays.report(query)),
      collectionsReport: ({ query }) => run(() => r.collections.report(query)),
      profitabilityReport: ({ query }) => run(() => r.profitability.report(query)),
      teamReport: ({ query }) => run(() => r.team.report(query)),
      serviceReport: ({ query }) => run(() => r.service.report(query)),
    });
  }
}
