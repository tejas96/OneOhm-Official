import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerAuthService, customerSession } from '../customer-portal/customer-auth.service';
import { CustomerPayService } from './customer-pay.service';

/** The customer app's Pay button; the customer comes from the bearer token, never the URL. */
@Public()
@Controller()
export class CustomerPayController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly pay: CustomerPayService,
  ) {}

  @TsRestHandler(apiContract.customerPay)
  handler(@Req() request: Request) {
    return tsRestHandler(apiContract.customerPay, {
      payMilestone: async ({ params }) => {
        const { customerId } = await customerSession(this.auth, request);
        return { status: 200, body: await this.pay.pay(customerId, params.id) };
      },
    });
  }
}
