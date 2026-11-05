import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { SurveyCreditService } from './survey-credit.service';
import { SurveyStaffService } from './survey-staff.service';

@Controller()
export class SelfSurveyController {
  constructor(
    private readonly surveys: SurveyStaffService,
    private readonly credits: SurveyCreditService,
  ) {}

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
      surveyCredits: async ({ query }) => ({
        status: 200,
        body: await this.credits.of(actor, query.projectId),
      }),
      settleSurveyCredit: async ({ params, body }) => ({
        status: 200,
        body: await this.credits.settle(actor, params.id, body.reason),
      }),
      surveyVisitInstead: async ({ params }) => ({
        status: 200,
        body: await this.surveys.visitInstead(actor, params.id),
      }),
    });
  }
}
