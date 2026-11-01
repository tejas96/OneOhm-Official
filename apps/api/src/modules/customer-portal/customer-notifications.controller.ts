import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { NotificationsService } from '../notifications/notifications.service';
import { CustomerAuthService, customerSession } from './customer-auth.service';

const { customerInbox, customerMarkRead, customerAddDevice, customerForgetDevice } =
  apiContract.notifications;
const routes = { customerInbox, customerMarkRead, customerAddDevice, customerForgetDevice };

/** The customer's own alerts and phones (customer bearer token). */
@Public()
@Controller()
export class CustomerNotificationsController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly notifications: NotificationsService,
  ) {}

  @TsRestHandler(routes)
  handler(@Req() request: Request) {
    const me = async () => ({ customerId: (await customerSession(this.auth, request)).customerId });
    return tsRestHandler(routes, {
      customerInbox: async () => ({
        status: 200,
        body: await this.notifications.inbox(await me()),
      }),
      customerMarkRead: async ({ body }) => {
        await this.notifications.markRead(await me(), body.ids);
        return { status: 204, body: undefined };
      },
      customerAddDevice: async ({ body }) => {
        await this.notifications.addDevice(await me(), body, 'customer');
        return { status: 204, body: undefined };
      },
      customerForgetDevice: async ({ body }) => {
        await this.notifications.forgetDevice(await me(), body.token);
        return { status: 204, body: undefined };
      },
    });
  }
}
