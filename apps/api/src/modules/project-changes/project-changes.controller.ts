import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ProjectChangesService } from './project-changes.service';

/** Raising needs project or sales rights; approving and withdrawing need a project manager. */
@Controller()
export class ProjectChangesController {
  constructor(private readonly changes: ProjectChangesService) {}

  @TsRestHandler(apiContract.projectChanges)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.projectChanges, {
      listProjectChanges: async ({ params }) => {
        assertCan(actor, 'projects.view_all');
        return { status: 200, body: await this.changes.list(params.id) };
      },
      previewProjectChange: async ({ params, body }) => {
        assertCan(actor, 'projects.manage', 'quotations.create');
        return { status: 200, body: await this.changes.preview(params.id, body) };
      },
      raiseProjectChange: async ({ params, body }) => {
        assertCan(actor, 'projects.manage', 'quotations.create');
        return { status: 201, body: await this.changes.raise(actor, params.id, body) };
      },
      approveProjectChange: async ({ params }) => {
        assertCan(actor, 'projects.manage');
        return { status: 200, body: await this.changes.approve(actor, params.id) };
      },
      withdrawProjectChange: async ({ params, body }) => {
        assertCan(actor, 'projects.manage');
        return { status: 200, body: await this.changes.withdraw(actor, params.id, body.reason) };
      },
      quotationProjectChange: async ({ params }) => {
        assertCan(actor, 'quotations.view', 'projects.view_all');
        return { status: 200, body: { change: await this.changes.forQuotation(params.id) } };
      },
    });
  }
}
