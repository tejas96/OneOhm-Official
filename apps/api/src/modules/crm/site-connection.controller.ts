import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { SiteConnectionService } from './site-connection.service';

/** Consumer number and DISCOM from the field app, on a lead's site or the electricity task. */
@Controller()
export class SiteConnectionController {
  constructor(private readonly connections: SiteConnectionService) {}

  @TsRestHandler(apiContract.siteConnection)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.siteConnection, {
      leadConnection: async ({ params }) => ({
        status: 200,
        body: await this.connections.forLead(actor, params.id),
      }),
      updateLeadConnection: async ({ params, body }) => {
        assertCan(actor, 'leads.manage');
        return { status: 200, body: await this.connections.updateLead(actor, params.id, body) };
      },
      taskConnection: async ({ params }) => ({
        status: 200,
        body: await this.connections.forTask(actor, params.id),
      }),
      updateTaskConnection: async ({ params, body }) => ({
        status: 200,
        body: await this.connections.updateTask(actor, params.id, body.discomId),
      }),
    });
  }
}
