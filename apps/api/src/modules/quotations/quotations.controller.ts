import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';
import { apiContract } from '../../contract';
import { assertQuotationAccess, detailFor, previewFor, quotationScope } from './quotation-access';
import { QuotationPricingService } from './quotation-pricing.service';
import { QuotationsService } from './quotations.service';
import { setSubsidyClaimed } from './subsidy-claim';

@Controller()
export class QuotationsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly quotations: QuotationsService,
    private readonly pricing: QuotationPricingService,
  ) {}

  @TsRestHandler(apiContract.quotations)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.quotations, {
      previewQuotation: async ({ body }) => {
        assertCan(actor, 'quotations.create');
        return { status: 200, body: previewFor(actor, (await this.pricing.price(body)).preview) };
      },
      createQuotation: async ({ body }) => {
        assertCan(actor, 'quotations.create');
        return { status: 201, body: detailFor(actor, await this.quotations.create(actor, body)) };
      },
      listQuotations: async ({ query }) => {
        assertCan(actor, 'quotations.view', 'quotations.create');
        return {
          status: 200,
          body: await this.quotations.list(query.status, quotationScope(actor)),
        };
      },
      getQuotation: async ({ params }) => {
        assertCan(actor, 'quotations.view', 'quotations.create');
        await assertQuotationAccess(this.db, actor, params.id);
        return { status: 200, body: detailFor(actor, await this.quotations.get(params.id)) };
      },
      approveDiscount: async ({ params }) => {
        assertCan(actor, 'quotations.approve_discount');
        return { status: 200, body: await this.quotations.approveDiscount(actor, params.id) };
      },
      sendQuotation: async ({ params }) => {
        assertCan(actor, 'quotations.create');
        await assertQuotationAccess(this.db, actor, params.id);
        return {
          status: 200,
          body: detailFor(actor, await this.quotations.send(actor, params.id)),
        };
      },
      acceptQuotation: async ({ params }) => {
        assertCan(actor, 'quotations.create');
        await assertQuotationAccess(this.db, actor, params.id);
        return {
          status: 200,
          body: detailFor(actor, await this.quotations.accept(actor, params.id)),
        };
      },
      setSubsidyClaimed: async ({ params, body }) => {
        assertCan(actor, 'subsidy.manage', 'customers.manage');
        return {
          status: 200,
          body: await setSubsidyClaimed(this.db, actor, params.id, body.claimed),
        };
      },
      rejectQuotation: async ({ params, body }) => {
        assertCan(actor, 'quotations.create');
        await assertQuotationAccess(this.db, actor, params.id);
        const rejected = await this.quotations.reject(actor, params.id, body.reason);
        return { status: 200, body: detailFor(actor, rejected) };
      },
    });
  }
}
