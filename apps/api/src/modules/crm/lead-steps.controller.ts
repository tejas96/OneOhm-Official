import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { LeadStepsService } from './lead-steps.service';

@Controller()
export class LeadStepsController {
  constructor(private readonly steps: LeadStepsService) {}

  @TsRestHandler(apiContract.leadSteps)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.leadSteps, {
      listLeadSteps: async () => ({ status: 200, body: await this.steps.list() }),
      createLeadStep: async ({ body }) => ({
        status: 201,
        body: await this.steps.create(actor, body),
      }),
      updateLeadStep: async ({ params, body }) => ({
        status: 200,
        body: await this.steps.update(actor, params.key, body),
      }),
    });
  }
}
