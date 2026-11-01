import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { DocumentRequirementsService } from './document-requirements.service';

@Controller()
export class DocumentRequirementsController {
  constructor(private readonly requirements: DocumentRequirementsService) {}

  @TsRestHandler(apiContract.documentRequirements)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.documentRequirements, {
      listDocumentRequirements: async () => {
        assertCan(actor, 'documents.view', 'settings.manage');
        return { status: 200, body: await this.requirements.list() };
      },
      createDocumentRequirement: async ({ body }) => ({
        status: 201,
        body: await this.requirements.create(actor, body),
      }),
      updateDocumentRequirement: async ({ params, body }) => ({
        status: 200,
        body: await this.requirements.update(actor, params.key, body),
      }),
    });
  }
}
