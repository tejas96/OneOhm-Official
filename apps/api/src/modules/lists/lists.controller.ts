import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { offsetOf, pageFrom } from '../../common/paging';
import { DATABASE, type Database } from '../../config/core.module';
import { apiContract } from '../../contract';
import { PaymentsReadService } from '../finance/payments-read.service';
import { customerPage } from './customer-page';
import { leadPage } from './lead-page';
import { projectPage } from './project-page';
import { quotationPage } from './quotation-page';
import { servicePage } from './service-page';

/** The long lists a page at a time; each guarded by the same rights as its whole list. */
@Controller()
export class ListsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly payments: PaymentsReadService,
  ) {}

  @TsRestHandler(apiContract.lists)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.lists, {
      projects: async ({ query }) => {
        assertCan(actor, 'projects.view_all');
        return { status: 200, body: await projectPage(this.db, query) };
      },
      // Lead visibility refuses people with no lead rights and narrows owners to their own.
      leads: async ({ query }) => ({ status: 200, body: await leadPage(this.db, actor, query) }),
      customers: async ({ query }) => {
        assertCan(actor, 'customers.view');
        return { status: 200, body: await customerPage(this.db, query) };
      },
      quotations: async ({ query }) => {
        assertCan(actor, 'quotations.view', 'quotations.create');
        return { status: 200, body: await quotationPage(this.db, actor, query) };
      },
      serviceRequests: async ({ query }) => {
        assertCan(actor, 'service.manage', 'customers.view');
        return { status: 200, body: await servicePage(this.db, query) };
      },
      payments: async ({ query }) => {
        assertCan(actor, 'finance.view', 'finance.record_payments');
        const offset = offsetOf(query);
        const [items, total] = await Promise.all([
          this.payments.list(query.limit, offset, query.q),
          this.payments.count(query.q),
        ]);
        return { status: 200, body: pageFrom(items, total, offset, query.limit) };
      },
    });
  }
}
