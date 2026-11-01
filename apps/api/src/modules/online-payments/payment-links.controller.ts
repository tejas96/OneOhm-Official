import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { PaymentLinksService } from './payment-links.service';

@Controller()
export class PaymentLinksController {
  constructor(private readonly links: PaymentLinksService) {}

  @TsRestHandler(apiContract.paymentLinks)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.paymentLinks, {
      setup: async () => {
        assertCan(actor, 'finance.view', 'finance.record_payments');
        return { status: 200, body: this.links.setup() };
      },
      create: async ({ params }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 201, body: await this.links.create(actor, params.id) };
      },
      cancel: async ({ params }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 200, body: await this.links.cancel(actor, params.id) };
      },
      settlements: async () => {
        assertCan(actor, 'finance.view');
        return { status: 200, body: await this.links.settlements() };
      },
    });
  }
}
