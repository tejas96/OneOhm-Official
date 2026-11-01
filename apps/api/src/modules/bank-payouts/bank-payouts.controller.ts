import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { BankPayoutsService } from './bank-payouts.service';

@Controller()
export class BankPayoutsController {
  constructor(private readonly payouts: BankPayoutsService) {}

  @TsRestHandler(apiContract.bankPayouts)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.bankPayouts, {
      payoutOptions: async ({ params }) => ({
        status: 200,
        body: await this.payouts.options(actor, params.id),
      }),
      sendPayout: async ({ params }) => ({
        status: 201,
        body: await this.payouts.send(actor, params.id),
      }),
      recentPayouts: async () => ({ status: 200, body: await this.payouts.recent(actor) }),
    });
  }
}
