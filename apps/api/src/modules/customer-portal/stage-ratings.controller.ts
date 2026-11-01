import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerAuthService, customerSession } from './customer-auth.service';
import { StageRatingsService } from './stage-ratings.service';

/** The customer app's side: finished stages to rate (bearer token, not staff session). */
@Public()
@Controller()
export class CustomerStageRatingsController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly ratings: StageRatingsService,
  ) {}

  @TsRestHandler(apiContract.customerStageRatings)
  handler(@Req() request: Request) {
    return tsRestHandler(apiContract.customerStageRatings, {
      myStageRatings: async () => {
        const { customerId } = await customerSession(this.auth, request);
        return { status: 200, body: await this.ratings.cards(customerId) };
      },
      rateStage: async ({ body }) => {
        const { customerId } = await customerSession(this.auth, request);
        return { status: 201, body: await this.ratings.rate(customerId, body) };
      },
    });
  }
}

/** Staff read a project's ratings and reply. */
@Controller()
export class StageRatingsController {
  constructor(private readonly ratings: StageRatingsService) {}

  @TsRestHandler(apiContract.stageRatings)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.stageRatings, {
      projectStageRatings: async ({ params }) => ({
        status: 200,
        body: await this.ratings.forProject(actor, params.id),
      }),
      replyToStageRating: async ({ params, body }) => ({
        status: 200,
        body: await this.ratings.reply(actor, params.id, body.reply),
      }),
    });
  }
}
