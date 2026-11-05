import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { SurveyStaffService } from './survey-staff.service';

@Controller()
export class SelfSurveyController {
  constructor(private readonly surveys: SurveyStaffService) {}

  @TsRestHandler(apiContract.selfSurvey)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.selfSurvey, {
      selfSurvey: async ({ query }) => ({
        status: 200,
        body: await this.surveys.of(actor, query.taskId),
      }),
      askSurveyAgain: async ({ params, body }) => ({
        status: 200,
        body: await this.surveys.askAgain(actor, params.id, body.items),
      }),
      surveyVisitInstead: async ({ params }) => ({
        status: 200,
        body: await this.surveys.visitInstead(actor, params.id),
      }),
    });
  }
}
