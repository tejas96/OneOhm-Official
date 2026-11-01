import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { MessageTemplatesService } from './message-templates.service';
import { TaskTemplatesService } from './task-templates.service';

@Controller()
export class TemplatesController {
  constructor(
    private readonly messages: MessageTemplatesService,
    private readonly tasks: TaskTemplatesService,
  ) {}

  @TsRestHandler(apiContract.templates)
  handler(@CurrentActor() actor: Actor) {
    const configure = () => assertCan(actor, 'settings.manage');
    return tsRestHandler(apiContract.templates, {
      messageTemplates: async () => {
        configure();
        return { status: 200, body: await this.messages.list() };
      },
      updateMessageTemplate: async ({ params, body }) => {
        configure();
        return { status: 200, body: await this.messages.update(actor, params.key, body) };
      },
      taskTemplates: async () => {
        configure();
        return { status: 200, body: await this.tasks.list() };
      },
      createTaskTemplate: async ({ body }) => {
        configure();
        return { status: 201, body: await this.tasks.create(actor, body) };
      },
      updateTaskTemplate: async ({ params, body }) => {
        configure();
        return { status: 200, body: await this.tasks.update(actor, params.id, body) };
      },
      moveTaskTemplate: async ({ params, body }) => {
        configure();
        return { status: 200, body: await this.tasks.move(params.id, body.direction) };
      },
    });
  }
}
