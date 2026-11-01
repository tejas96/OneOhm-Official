import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CashHandlingService } from './cash-handling.service';

@Controller()
export class CashHandlingController {
  constructor(private readonly cash: CashHandlingService) {}

  @TsRestHandler(apiContract.cashHandling)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.cashHandling, {
      cashPosition: async () => ({ status: 200, body: await this.cash.position(actor) }),
      listDeposits: async () => ({ status: 200, body: await this.cash.deposits(actor) }),
      depositItems: async ({ params }) => ({
        status: 200,
        body: await this.cash.depositItems(actor, params.id),
      }),
      createDeposit: async ({ body }) => ({
        status: 201,
        body: await this.cash.createDeposit(actor, body),
      }),
      clearCheque: async ({ params, body }) => ({
        status: 200,
        body: await this.cash.clearCheque(actor, params.paymentId, body.clearedOn),
      }),
      bounceCheque: async ({ params, body }) => ({
        status: 200,
        body: await this.cash.bounceCheque(actor, params.paymentId, body),
      }),
    });
  }
}
