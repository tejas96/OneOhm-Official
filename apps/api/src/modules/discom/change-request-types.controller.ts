import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ChangeRequestOptionsService } from './change-request-options.service';
import { ChangeRequestTypesService } from './change-request-types.service';

/** Settings → DISCOMs → Change requests, and what the raise form offers (PRD 3.15). */
@Controller()
export class ChangeRequestTypesController {
  constructor(
    private readonly types: ChangeRequestTypesService,
    private readonly options: ChangeRequestOptionsService,
  ) {}

  @TsRestHandler(apiContract.changeRequestTypes)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.changeRequestTypes, {
      listChangeRequestTypes: async ({ params }) => ({
        status: 200,
        body: await this.types.list(actor, params.id),
      }),
      createChangeRequestType: async ({ params, body }) => ({
        status: 201,
        body: await this.types.create(actor, params.id, body),
      }),
      updateChangeRequestType: async ({ params, body }) => ({
        status: 200,
        body: await this.types.update(actor, params.id, body),
      }),
      changeRequestOptions: async ({ query }) => {
        assertCan(actor, 'discom.manage', 'customers.manage');
        return { status: 200, body: await this.options.options(query) };
      },
    });
  }
}
