import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { DutyPointsService } from './duty-points.service';
import { DutyRouteService } from './duty-route.service';

/** The route a phone records on duty, and reading it back (Duty Day step 1). */
@Controller()
export class DutyPointsController {
  constructor(
    private readonly points: DutyPointsService,
    private readonly routes: DutyRouteService,
  ) {}

  @TsRestHandler(apiContract.dutyPoints)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.dutyPoints, {
      uploadDutyPoints: async ({ body }) => {
        assertCan(actor, 'attendance.mark');
        return { status: 200, body: await this.points.upload(actor, body.points) };
      },
      myDutyRoute: async ({ query }) => {
        assertCan(actor, 'attendance.mark');
        return { status: 200, body: await this.routes.route(actor, actor.userId, query.date) };
      },
      // Who may read another person's route is decided by the service.
      dutyRoute: async ({ params, query }) => ({
        status: 200,
        body: await this.routes.route(actor, params.id, query.date),
      }),
    });
  }
}
