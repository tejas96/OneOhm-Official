import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerAuthService, customerSession } from './customer-auth.service';
import { CustomerLanguageService } from './customer-language.service';

/** The customer app saves the customer's language (bearer token, not staff session). */
@Public()
@Controller()
export class CustomerAppLanguageController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly languages: CustomerLanguageService,
  ) {}

  @TsRestHandler(apiContract.customerAppLanguage)
  handler(@Req() request: Request) {
    return tsRestHandler(apiContract.customerAppLanguage, {
      setMyLanguage: async ({ body }) => ({
        status: 200,
        body: await this.languages.setOwn(await customerSession(this.auth, request), body.language),
      }),
    });
  }
}

/** Staff see and set a customer's language on the customer page. */
@Controller()
export class CustomerLanguageController {
  constructor(private readonly languages: CustomerLanguageService) {}

  @TsRestHandler(apiContract.customerLanguage)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.customerLanguage, {
      customerLanguage: async ({ params }) => ({
        status: 200,
        body: await this.languages.get(actor, params.id),
      }),
      setCustomerLanguage: async ({ params, body }) => ({
        status: 200,
        body: await this.languages.set(actor, params.id, body.language),
      }),
    });
  }
}
