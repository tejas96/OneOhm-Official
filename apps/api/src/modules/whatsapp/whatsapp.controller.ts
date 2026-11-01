import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ChatsService } from './chats.service';
import { DeliveriesService } from './deliveries.service';

@Controller()
export class WhatsAppController {
  constructor(
    private readonly chats: ChatsService,
    private readonly deliveries: DeliveriesService,
  ) {}

  @TsRestHandler(apiContract.whatsapp)
  handler(@CurrentActor() actor: Actor) {
    const allowed = () => assertCan(actor, 'service.manage', 'customers.manage');
    return tsRestHandler(apiContract.whatsapp, {
      chats: async () => {
        allowed();
        return { status: 200, body: await this.chats.list() };
      },
      chat: async ({ params }) => {
        allowed();
        return { status: 200, body: await this.chats.get(params.id) };
      },
      reply: async ({ params, body }) => {
        allowed();
        return { status: 201, body: await this.chats.reply(actor, params.id, body.text) };
      },
      release: async ({ params }) => {
        allowed();
        return { status: 200, body: await this.chats.release(params.id) };
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
