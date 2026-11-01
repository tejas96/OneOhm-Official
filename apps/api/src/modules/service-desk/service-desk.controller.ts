import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ServiceDeskService } from './service-desk.service';

@Controller()
export class ServiceDeskController {
  constructor(private readonly desk: ServiceDeskService) {}

  @TsRestHandler(apiContract.serviceDesk)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.serviceDesk, {
      listTickets: async ({ query }) => {
        assertCan(actor, 'service.manage', 'customers.view');
        return { status: 200, body: await this.desk.tickets(query) };
      },
      listAssignees: async () => {
        assertCan(actor, 'service.manage');
        return { status: 200, body: await this.desk.assignees() };
      },
      updateTicket: async ({ params, body }) => {
        assertCan(actor, 'service.manage');
        return { status: 200, body: await this.desk.update(actor.userId, params.id, body) };
      },
      listFeedback: async () => {
        assertCan(actor, 'service.manage', 'dashboard.view_business');
        return { status: 200, body: await this.desk.feedback() };
      },
    });
  }
}
