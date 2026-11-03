import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { LeadCampaignsService } from './lead-campaigns.service';

@Controller()
export class LeadCampaignsController {
  constructor(private readonly campaigns: LeadCampaignsService) {}

  @TsRestHandler(apiContract.leadCampaigns)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.leadCampaigns, {
      listLeadCampaigns: async () => ({ status: 200, body: await this.campaigns.list() }),
      createLeadCampaign: async ({ body }) => ({
        status: 201,
        body: await this.campaigns.create(actor, body),
      }),
      updateLeadCampaign: async ({ params, body }) => ({
        status: 200,
        body: await this.campaigns.update(actor, params.code, body),
      }),
    });
  }
}
