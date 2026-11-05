import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ReferralProgramService } from './referral-program.service';
import { ReferralRewardsService } from './referral-rewards.service';

/** Refer and earn for staff: the owner's settings and finance's rewards (PRD 5.6). */
@Controller()
export class ReferralsController {
  constructor(
    private readonly program: ReferralProgramService,
    private readonly rewards: ReferralRewardsService,
  ) {}

  @TsRestHandler(apiContract.referrals)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.referrals, {
      program: async () => {
        assertCan(actor, 'settings.manage', 'finance.view');
        return { status: 200, body: await this.program.get() };
      },
      saveProgram: async ({ body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.program.save(actor, body) };
      },
      lookupCode: async ({ params }) => {
        assertCan(actor, 'leads.manage', 'leads.view_all');
        return { status: 200, body: await this.program.lookup(params.code) };
      },
      listRewards: async ({ query }) => {
        assertCan(actor, 'finance.view', 'finance.record_payments');
        return { status: 200, body: await this.rewards.list(query.status) };
      },
      approveReward: async ({ params }) => {
        assertCan(actor, 'finance.approve_payments');
        return { status: 200, body: await this.rewards.approve(actor, params.id) };
      },
      rejectReward: async ({ params, body }) => {
        assertCan(actor, 'finance.approve_payments');
        return { status: 200, body: await this.rewards.reject(actor, params.id, body.reason) };
      },
      checkRewardUpi: async ({ params, body }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 200, body: await this.rewards.checkUpi(actor, params.id, body) };
      },
      payReward: async ({ params, body }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 200, body: await this.rewards.pay(actor, params.id, body) };
      },
    });
  }
}
