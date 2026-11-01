import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { QuotationPricingService } from './quotation-pricing.service';
import { QuotationsService } from './quotations.service';

@Controller()
export class QuotationsController {
  constructor(
    private readonly quotations: QuotationsService,
    private readonly pricing: QuotationPricingService,
  ) {}

  @TsRestHandler(apiContract.quotations)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.quotations, {
      previewQuotation: async ({ body }) => {
        assertCan(actor, 'quotations.create');
        return { status: 200, body: (await this.pricing.price(body)).preview };
      },
      createQuotation: async ({ body }) => {
        assertCan(actor, 'quotations.create');
        return { status: 201, body: await this.quotations.create(actor, body) };
      },
      listQuotations: async ({ query }) => {
        assertCan(actor, 'quotations.view', 'quotations.create');
        return { status: 200, body: await this.quotations.list(query.status) };
      },
      getQuotation: async ({ params }) => {
        assertCan(actor, 'quotations.view', 'quotations.create');
        return { status: 200, body: await this.quotations.get(params.id) };
      },
      approveDiscount: async ({ params }) => {
        assertCan(actor, 'quotations.approve_discount');
        return { status: 200, body: await this.quotations.approveDiscount(actor, params.id) };
      },
      sendQuotation: async ({ params }) => {
        assertCan(actor, 'quotations.create');
        return { status: 200, body: await this.quotations.send(actor, params.id) };
      },
      acceptQuotation: async ({ params }) => {
        assertCan(actor, 'quotations.create');
        return { status: 200, body: await this.quotations.accept(actor, params.id) };
      },
      rejectQuotation: async ({ params, body }) => {
        assertCan(actor, 'quotations.create');
        return { status: 200, body: await this.quotations.reject(actor, params.id, body.reason) };
      },
    });
  }
}
