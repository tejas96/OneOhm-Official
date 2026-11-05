import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { forbidden } from '../../common/http/errors';
import { apiContract } from '../../contract';
import { ChatsService } from './chats.service';
import { DeliveriesService } from './deliveries.service';
import { FormSettingsService } from './forms/form-settings';

@Controller()
export class WhatsAppController {
  constructor(
    private readonly chats: ChatsService,
    private readonly deliveries: DeliveriesService,
    private readonly forms: FormSettingsService,
  ) {}

  @TsRestHandler(apiContract.whatsapp)
  handler(@CurrentActor() actor: Actor) {
    const allowed = () => assertCan(actor, 'service.manage', 'customers.manage');
    // Chats: any staff member, limited to the chats they answer unless they run a desk.
    const staff = () => {
      if (actor.kind !== 'staff') throw forbidden();
    };
    return tsRestHandler(apiContract.whatsapp, {
      chats: async () => {
        staff();
        return { status: 200, body: await this.chats.list(actor) };
      },
      chat: async ({ params }) => {
        staff();
        return { status: 200, body: await this.chats.get(actor, params.id) };
      },
      open: async ({ body }) => {
        staff();
        return { status: 200, body: await this.chats.open(actor, body.phone) };
      },
      byPhone: async ({ query }) => {
        staff();
        return {
          status: 200,
          body: { detail: await this.chats.byPhone(actor, query.phone, query.customerId) },
        };
      },
      team: async () => {
        staff();
        return { status: 200, body: await this.chats.team() };
      },
      assign: async ({ params, body }) => {
        staff();
        return { status: 200, body: await this.chats.assign(actor, params.id, body.userId) };
      },
      reply: async ({ params, body }) => {
        staff();
        return { status: 201, body: await this.chats.reply(actor, params.id, body.text) };
      },
      release: async ({ params }) => {
        staff();
        return { status: 200, body: await this.chats.release(actor, params.id) };
      },
      forms: async () => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.forms.list() };
      },
      saveForm: async ({ params, body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.forms.save(actor, params.key, body.flowId) };
      },
      deliveries: async ({ query }) => {
        allowed();
        return { status: 200, body: await this.deliveries.list(query.state) };
      },
      retryDelivery: async ({ params }) => {
        allowed();
        return { status: 200, body: await this.deliveries.retry(params.id) };
      },
    });
  }
}
