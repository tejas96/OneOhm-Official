import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { DocumentRequestsService } from './document-requests.service';

@Controller()
export class DocumentRequestsController {
  constructor(private readonly requests: DocumentRequestsService) {}

  @TsRestHandler(apiContract.documentRequests)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.documentRequests, {
      listDocumentRequests: async ({ query }) => ({
        status: 200,
        body: await this.requests.list(actor, query),
      }),
      createDocumentRequest: async ({ body }) => ({
        status: 201,
        body: await this.requests.create(actor, body),
      }),
      cancelDocumentRequest: async ({ params }) => ({
        status: 200,
        body: await this.requests.cancel(actor, params.id),
      }),
      reaskDocumentRequest: async ({ params, body }) => ({
        status: 200,
        body: await this.requests.reask(actor, params.id, body),
      }),
    });
  }
}
