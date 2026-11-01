import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { SkillsService } from './skills.service';

@Controller()
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @TsRestHandler(apiContract.skills)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.skills, {
      // Any signed-in staff member may see the list (it labels people and tasks).
      listSkills: async () => ({ status: 200, body: await this.skills.list() }),
      createSkill: async ({ body }) => ({
        status: 201,
        body: await this.skills.create(actor, body),
      }),
      updateSkill: async ({ params, body }) => ({
        status: 200,
        body: await this.skills.update(actor, params.key, body),
      }),
    });
  }
}
