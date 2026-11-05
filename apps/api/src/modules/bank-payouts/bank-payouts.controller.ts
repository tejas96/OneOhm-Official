import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { pdfBody } from '../reports/reports.controller';
import { BankHoldService } from './bank-hold.service';
import { BankPayoutsService } from './bank-payouts.service';
import { PayoutAdviceService } from './payout-advice.service';
import { PayoutIpService } from './payout-ip.service';
import { PayoutMatchService } from './payout-match.service';
import { PayoutRequestsService } from './payout-requests.service';

@Controller()
export class BankPayoutsController {
  constructor(
    private readonly payouts: BankPayoutsService,
    private readonly requests: PayoutRequestsService,
    private readonly holds: BankHoldService,
    private readonly advice: PayoutAdviceService,
    private readonly ip: PayoutIpService,
    private readonly match: PayoutMatchService,
  ) {}

  @TsRestHandler(apiContract.bankPayouts)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.bankPayouts, {
      payoutOptions: async ({ params }) => ({
        status: 200,
        body: await this.payouts.options(actor, params.id),
      }),
      sendPayout: async ({ params, body }) => ({
        status: 201,
        body: await this.payouts.send(actor, params.id, body?.amountPaise),
      }),
      requestPayout: async ({ params, body }) => ({
        status: 201,
        body: await this.requests.ask(actor, params.id, body?.amountPaise),
      }),
      withdrawPayoutRequest: async ({ params }) => {
        await this.requests.withdraw(actor, params.id);
        return { status: 204, body: undefined };
      },
      declinePayoutRequest: async ({ params, body }) => {
        await this.requests.decline(actor, params.id, body.note);
        return { status: 204, body: undefined };
      },
      releaseBankHold: async ({ params }) => {
        await this.holds.release(actor, params.kind, params.id);
        return { status: 204, body: undefined };
      },
      payoutSetup: async () => {
        const setup = await this.payouts.setup(actor);
        return { status: 200, body: { ...setup, ...(await this.ip.forSetup(setup)) } };
      },
      payoutMatch: async ({ query }) => ({
        status: 200,
        body: await this.match.report(actor, query.days),
      }),
      payoutAdvice: async ({ params, query }) => {
        assertCan(actor, 'finance.view', 'finance.record_payments');
        return {
          status: 200,
          body: pdfBody(await this.advice.render(params.id), query.disposition),
        };
      },
      practicePayout: async ({ params, body }) => ({
        status: 200,
        body: await this.payouts.practice(actor, params.id, body.outcome),
      }),
      recentPayouts: async () => ({ status: 200, body: await this.payouts.recent(actor) }),
    });
  }
}
