import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ChangeRequestStepsService } from './change-request-steps.service';
import { ChangeRequestsService } from './change-requests.service';
import { DiscomDeskService } from './discom-desk.service';

@Controller()
export class DiscomController {
  constructor(
    private readonly desk: DiscomDeskService,
    private readonly requests: ChangeRequestsService,
    private readonly steps: ChangeRequestStepsService,
  ) {}

  @TsRestHandler(apiContract.discom)
  handler(@CurrentActor() actor: Actor) {
    const manage = () => assertCan(actor, 'discom.manage');
    const view = () => assertCan(actor, 'discom.manage', 'customers.view', 'projects.view_all');
    return tsRestHandler(apiContract.discom, {
      discomDesk: async () => {
        manage();
        return { status: 200, body: await this.desk.desk() };
      },
      updateFollowUp: async ({ params, body }) => {
        manage();
        return { status: 200, body: await this.desk.updateFollowUp(actor, params.taskId, body) };
      },
      listChangeRequests: async ({ query }) => {
        view();
        return { status: 200, body: await this.requests.list(query) };
      },
      createChangeRequest: async ({ body }) => {
        assertCan(actor, 'discom.manage', 'customers.manage');
        return { status: 201, body: await this.requests.create(actor, body) };
      },
      getChangeRequest: async ({ params }) => {
        view();
        return { status: 200, body: await this.requests.get(params.id) };
      },
      changeRequestSuggestions: async ({ params }) => {
        view();
        return { status: 200, body: await this.requests.suggestions(params.id) };
      },
      startChangeRequestStep: async ({ params }) => ({
        status: 200,
        body: await this.steps.start(actor, params.id, params.stepId),
      }),
      waitChangeRequestStep: async ({ params, body }) => ({
        status: 200,
        body: await this.steps.wait(actor, params.id, params.stepId, body),
      }),
      completeChangeRequestStep: async ({ params, body }) => ({
        status: 200,
        body: await this.steps.complete(actor, params.id, params.stepId, body.facts, body.note),
      }),
      cancelChangeRequest: async ({ params, body }) => {
        manage();
        return { status: 200, body: await this.requests.cancel(actor, params.id, body.reason) };
      },
    });
  }
}
