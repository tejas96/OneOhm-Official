import { Controller } from '@nestjs/common';
import { CAPABILITIES } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { PeopleService } from './people.service';
import { RolesService } from './roles.service';

@Controller()
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly roles: RolesService,
  ) {}

  @TsRestHandler(apiContract.people)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.people, {
      listPeople: async () => {
        assertCan(actor, 'people.view', 'people.manage', 'tasks.assign', 'projects.manage');
        return { status: 200, body: await this.people.list() };
      },
      createPerson: async ({ body }) => {
        assertCan(actor, 'people.manage');
        return { status: 201, body: await this.people.create(actor, body) };
      },
      updatePerson: async ({ params, body }) => {
        // Which roles may change is checked in the service: rolesOutOfReach.
        assertCan(actor, 'people.manage');
        return { status: 200, body: await this.people.update(actor, params.id, body) };
      },
      listRoles: async () => {
        assertCan(actor, 'people.view', 'people.manage', 'roles.manage');
        return { status: 200, body: await this.roles.list() };
      },
      createRole: async ({ body }) => {
        assertCan(actor, 'roles.manage');
        return { status: 201, body: await this.roles.create(actor, body) };
      },
      updateRole: async ({ params, body }) => {
        assertCan(actor, 'roles.manage');
        return { status: 200, body: await this.roles.update(actor, params.id, body) };
      },
      listCapabilities: async () => ({ status: 200, body: [...CAPABILITIES] }),
    });
  }
}
