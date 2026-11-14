import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';
import { apiContract } from '../../contract';
import { listVisits } from './visit-list';
import { VisitsService } from './visits.service';

@Controller()
export class VisitsController {
  constructor(
    private readonly visits: VisitsService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @TsRestHandler(apiContract.visits)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.visits, {
      visitsOf: async ({ query }) => ({ status: 200, body: await this.visits.of(actor, query) }),
      listVisits: async ({ query }) => ({
        status: 200,
        body: await listVisits(this.db, actor, query),
      }),
      setVisit: async ({ body }) => ({ status: 200, body: await this.visits.set(actor, body) }),
      cancelVisit: async ({ params, body }) => ({
        status: 200,
        body: await this.visits.cancel(actor, params.id, body.reason),
      }),
      doneVisit: async ({ params }) => ({
        status: 200,
        body: await this.visits.done(actor, params.id),
      }),
    });
  }
}
