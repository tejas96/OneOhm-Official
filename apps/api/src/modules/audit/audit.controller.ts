import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { AuditService } from './audit.service';

@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @TsRestHandler(apiContract.audit)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.audit, {
      activity: async ({ query }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.audit.activity(query) };
      },
      signIns: async ({ query }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.audit.signIns(query.failedOnly === 'true') };
      },
    });
  }
}
