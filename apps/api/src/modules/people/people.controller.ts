import { Controller, Inject } from '@nestjs/common';
import { CAPABILITIES } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';
import { apiContract } from '../../contract';
import { departureSummary } from './departure/departure-summary';
import { PeopleService } from './people.service';
import { PersonInvites } from './person-invite';
import { RolesService } from './roles.service';

@Controller()
export class PeopleController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly people: PeopleService,
    private readonly roles: RolesService,
    private readonly invites: PersonInvites,
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
      invitePerson: async ({ params }) => {
        assertCan(actor, 'people.manage');
        return { status: 202, body: await this.invites.resend(actor, params.id) };
      },
      releasePhone: async ({ params }) => {
        assertCan(actor, 'people.manage');
        return { status: 200, body: await this.invites.releasePhone(actor, params.id) };
      },
      getDeparture: async ({ params }) => {
        assertCan(actor, 'people.manage');
        return { status: 200, body: await departureSummary(this.db, params.id) };
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
