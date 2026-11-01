import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerAuthService, customerSession } from './customer-auth.service';
import { CustomerFamilyService } from './customer-family.service';

@Public()
@Controller()
export class CustomerFamilyController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly family: CustomerFamilyService,
  ) {}

  @TsRestHandler(apiContract.customerFamily)
  handler(@Req() request: Request) {
    return tsRestHandler(apiContract.customerFamily, {
      listFamily: async () => ({
        status: 200,
        body: await this.family.list(await customerSession(this.auth, request)),
      }),
      addFamily: async ({ body }) => ({
        status: 201,
        body: await this.family.add(await customerSession(this.auth, request), body),
      }),
      removeFamily: async ({ params }) => ({
        status: 200,
        body: await this.family.remove(await customerSession(this.auth, request), params.id),
      }),
    });
  }
}
