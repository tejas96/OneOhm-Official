import { Controller, Inject, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor, Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';
import { apiContract } from '../../contract';
import { LeadIntakeService } from './lead-intake.service';
import { leadOwnerOptions } from './lead-owner';
import { receiveWebsiteLead } from './website-leads';

/** Who already has a phone number, and who can own a lead, while the office adds one. */
@Controller()
export class PhoneMatchController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly intake: LeadIntakeService,
  ) {}

  @TsRestHandler(apiContract.leadIntake.matchPhone)
  match(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.leadIntake.matchPhone, async ({ query }) => {
      assertCan(actor, 'leads.manage');
      return { status: 200, body: await this.intake.match(actor, query.phone) };
    });
  }

  @TsRestHandler(apiContract.leadIntake.leadOwners)
  owners(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.leadIntake.leadOwners, async () => {
      assertCan(actor, 'leads.manage');
      return { status: 200, body: await leadOwnerOptions(this.db) };
    });
  }
}

/** The website's enquiry form; no sign-in, rate limited (see docs/DEPLOYMENT.md). */
@Public()
@Controller()
export class WebsiteLeadController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly intake: LeadIntakeService,
  ) {}

  @TsRestHandler(apiContract.leadIntake.websiteLead)
  handler(@Req() request: Request) {
    return tsRestHandler(apiContract.leadIntake.websiteLead, async ({ body }) => {
      await receiveWebsiteLead(this.db, this.intake, body, request.ip ?? null);
      return { status: 202, body: { received: true as const } };
    });
  }
}
