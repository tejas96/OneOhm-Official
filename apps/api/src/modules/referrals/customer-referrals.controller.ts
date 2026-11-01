import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerAuthService, customerSession } from '../customer-portal/customer-auth.service';
import { ReferralProgramService } from './referral-program.service';

/**
 * The customer app's refer-and-earn card. Staff sessions do not apply (`@Public` for the
 * staff guard); the customer comes from the bearer token.
 */
@Public()
@Controller()
export class CustomerReferralsController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly program: ReferralProgramService,
  ) {}

  @TsRestHandler(apiContract.customerReferrals)
  handler(@Req() request: Request) {
    return tsRestHandler(apiContract.customerReferrals, {
      referralProgram: async () => {
        const { customerId } = await customerSession(this.auth, request);
        return { status: 200, body: await this.program.forCustomer(customerId) };
      },
    });
  }
}
