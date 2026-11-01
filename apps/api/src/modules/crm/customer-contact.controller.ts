import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerContactService } from './customer-contact.service';

@Controller()
export class CustomerContactController {
  constructor(private readonly contact: CustomerContactService) {}

  @TsRestHandler(apiContract.customerContact)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.customerContact, {
      customerContact: async ({ params }) => ({
        status: 200,
        body: await this.contact.get(actor, params.id),
      }),
      setCustomerContact: async ({ params, body }) => ({
        status: 200,
        body: await this.contact.set(actor, params.id, body),
      }),
      listHandovers: async ({ query }) => ({
        status: 200,
        body: await this.contact.handovers(actor, query),
      }),
      completeHandover: async ({ params, body }) => ({
        status: 200,
        body: await this.contact.complete(actor, params.id, body.note),
      }),
    });
  }
}
