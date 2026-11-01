import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { NotificationsService } from './notifications.service';

const { inbox, markRead, addDevice, forgetDevice } = apiContract.notifications;
const routes = { inbox, markRead, addDevice, forgetDevice };

/** A staff member's own alerts and phones. Everyone signed in may use these. */
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @TsRestHandler(routes)
  handler(@CurrentActor() actor: Actor) {
    const me = { userId: actor.userId };
    return tsRestHandler(routes, {
      inbox: async () => ({ status: 200, body: await this.notifications.inbox(me) }),
      markRead: async ({ body }) => {
        await this.notifications.markRead(me, body.ids);
        return { status: 204, body: undefined };
      },
      addDevice: async ({ body }) => {
        await this.notifications.addDevice(me, body, 'field');
        return { status: 204, body: undefined };
      },
      forgetDevice: async ({ body }) => {
        await this.notifications.forgetDevice(me, body.token);
        return { status: 204, body: undefined };
      },
    });
  }
}
