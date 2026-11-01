import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { TeamLoadService } from './team-load.service';

@Controller()
export class TeamLoadController {
  constructor(private readonly team: TeamLoadService) {}

  @TsRestHandler(apiContract.teamLoad.teamLoad)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.teamLoad.teamLoad, async ({ query }) => {
      assertCan(actor, 'projects.view_all');
      return { status: 200, body: await this.team.load(query) };
    });
  }

  @TsRestHandler(apiContract.teamLoad.taskBoard)
  tasks(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.teamLoad.taskBoard, async ({ query }) => {
      assertCan(actor, 'projects.view_all');
      return { status: 200, body: await this.team.tasks(query) };
    });
  }
}
