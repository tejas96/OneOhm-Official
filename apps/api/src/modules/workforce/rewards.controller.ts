import { Controller } from '@nestjs/common';
import { pointsEntries } from '@oneohm/database';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { eq } from 'drizzle-orm';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { PointsService } from './points.service';
import { WorkforceSettingsService } from './workforce-settings.service';

@Controller()
export class RewardsController {
  constructor(
    private readonly points: PointsService,
    private readonly settings: WorkforceSettingsService,
  ) {}

  @TsRestHandler(apiContract.rewards)
  handler(@CurrentActor() actor: Actor) {
    const manage = () => assertCan(actor, 'people.manage');
    const configure = () => assertCan(actor, 'settings.manage');
    return tsRestHandler(apiContract.rewards, {
      standings: async () => {
        assertCan(actor, 'people.view');
        return { status: 200, body: await this.points.standings() };
      },
      listPoints: async ({ query }) => {
        assertCan(actor, 'people.view');
        const filter = query.status ? eq(pointsEntries.status, query.status) : undefined;
        return { status: 200, body: await this.points.list(filter) };
      },
      givePoints: async ({ body }) => {
        manage();
        return { status: 201, body: await this.points.give(actor, body) };
      },
      decidePoints: async ({ params, body }) => {
        manage();
        return { status: 200, body: await this.points.decide(actor, params.id, body.approve) };
      },
      workforceSettings: async () => {
        assertCan(actor, 'settings.manage', 'people.manage');
        return { status: 200, body: await this.settings.get() };
      },
      saveWorkforcePolicy: async ({ body }) => {
        configure();
        return { status: 200, body: await this.settings.savePolicy(actor, body) };
      },
      addWorkLocation: async ({ body }) => {
        configure();
        return { status: 201, body: await this.settings.addLocation(actor, body) };
      },
      updateWorkLocation: async ({ params, body }) => {
        configure();
        return { status: 200, body: await this.settings.updateLocation(actor, params.id, body) };
      },
    });
  }
}
