import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { PayoutSyncService } from '../bank-payouts/payout-sync.service';
import { LinkSyncService } from './link-sync.service';

/** "Check with Razorpay now", for when a customer says they paid a moment ago. */
@Controller()
export class GatewayCheckController {
  constructor(
    private readonly links: LinkSyncService,
    private readonly payouts: PayoutSyncService,
  ) {}

  @TsRestHandler(apiContract.gatewayCheck)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.gatewayCheck, {
      checkGateway: async () => {
        assertCan(actor, 'finance.view', 'finance.record_payments');
        const links = await this.links.run();
        const payouts = await this.payouts.run();
        return { status: 200, body: { ...links, payoutsUpdated: payouts.updated } };
      },
    });
  }
}
