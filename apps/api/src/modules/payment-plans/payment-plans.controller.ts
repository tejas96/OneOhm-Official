import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { PaymentPlansService } from './payment-plans.service';

@Controller()
export class PaymentPlansController {
  constructor(private readonly plans: PaymentPlansService) {}

  @TsRestHandler(apiContract.paymentPlans)
  handler(@CurrentActor() actor: Actor) {
    const configure = () => assertCan(actor, 'settings.manage');
    return tsRestHandler(apiContract.paymentPlans, {
      list: async () => {
        // People creating projects pick a plan, so they may read the list.
        assertCan(actor, 'settings.manage', 'projects.create', 'projects.manage');
        return { status: 200, body: await this.plans.list() };
      },
      create: async ({ body }) => {
        configure();
        return { status: 201, body: await this.plans.create(actor, body) };
      },
      update: async ({ params, body }) => {
        configure();
        return { status: 200, body: await this.plans.update(actor, params.id, body) };
      },
      makeDefault: async ({ params }) => {
        configure();
        return { status: 200, body: await this.plans.makeDefault(actor, params.id) };
      },
    });
  }
}
