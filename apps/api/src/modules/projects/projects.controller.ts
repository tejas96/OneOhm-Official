import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CommandCenterService } from '../dashboard/command-center.service';
import { FinanceService } from './finance.service';
import { ProjectCreationService } from './project-creation.service';
import { ProjectReadService } from './project-read.service';
import { taskFlowHandlers } from './task-flow.handlers';
import { TaskFlowService } from './task-flow.service';
import { TasksService } from './tasks.service';

@Controller()
export class ProjectsController {
  constructor(
    private readonly creation: ProjectCreationService,
    private readonly read: ProjectReadService,
    private readonly finance: FinanceService,
    private readonly commandCenter: CommandCenterService,
  ) {}

  @TsRestHandler(apiContract.projects)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.projects, {
      createProject: async ({ body }) => {
        assertCan(actor, 'projects.create');
        return { status: 201, body: await this.creation.create(actor, body) };
      },
      listProjects: async () => {
        assertCan(actor, 'projects.view_all');
        return { status: 200, body: await this.read.list() };
      },
      getProject: async ({ params }) => {
        assertCan(actor, 'projects.view_all');
        return { status: 200, body: await this.read.get(params.id) };
      },
      recordPayment: async ({ params, body }) => {
        assertCan(actor, 'finance.record_payments');
        await this.finance.recordPayment(actor, params.id, body);
        return { status: 201, body: await this.read.get(params.id) };
      },
      commandCenter: async ({ query }) => {
        assertCan(actor, 'dashboard.view_business');
        return { status: 200, body: await this.commandCenter.get(query) };
      },
    });
  }
}

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly flow: TaskFlowService,
  ) {}

  @TsRestHandler(apiContract.tasks)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.tasks, {
      myTasks: async () => ({ status: 200, body: await this.tasks.mine(actor) }),
      getTask: async ({ params }) => ({
        status: 200,
        body: await this.tasks.get(actor, params.id),
      }),
      startTask: async ({ params }) => ({
        status: 200,
        body: await this.tasks.start(actor, params.id),
      }),
      markWaiting: async ({ params, body }) => ({
        status: 200,
        body: await this.tasks.markWaiting(actor, params.id, body.party, body.note),
      }),
      completeTask: async ({ params, body }) => ({
        status: 200,
        body: await this.tasks.complete(actor, params.id, body.facts, body.note),
      }),
      approveTask: async ({ params }) => ({
        status: 200,
        body: await this.tasks.approve(actor, params.id),
      }),
      assignTask: async ({ params, body }) => ({
        status: 200,
        body: await this.tasks.assign(actor, params.id, body.userId),
      }),
      ...taskFlowHandlers(this.flow, actor),
    });
  }
}
