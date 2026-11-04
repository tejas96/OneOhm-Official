import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { LocationReviewService } from './location-review.service';
import { SendToCustomerService } from './send-to-customer.service';

@Controller()
export class SendToCustomerController {
  constructor(
    private readonly send: SendToCustomerService,
    private readonly locations: LocationReviewService,
  ) {}

  @TsRestHandler(apiContract.sendToCustomer)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.sendToCustomer, {
      sendOptions: async ({ query }) => ({
        status: 200,
        body: await this.send.options(actor, query),
      }),
      sendPreview: async ({ body }) => ({
        status: 200,
        body: await this.send.preview(actor, body),
      }),
      sendToCustomer: async ({ body }) => ({
        status: 201,
        body: await this.send.send(actor, body),
      }),
      acceptLocation: async ({ params }) => ({
        status: 200,
        body: await this.locations.accept(actor, params.id),
      }),
      markCalled: async ({ params }) => ({
        status: 200,
        body: await this.locations.called(actor, params.id),
      }),
      ignoreLocation: async ({ params }) => ({
        status: 200,
        body: await this.locations.ignore(actor, params.id),
      }),
    });
  }
}
