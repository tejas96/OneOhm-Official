import { Controller } from '@nestjs/common';
import { projectBonuses } from '@oneohm/database';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { eq } from 'drizzle-orm';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { AnnouncementsService } from './announcements.service';
import { BonusesService } from './bonuses.service';
import { CapacityService } from './capacity.service';
import { MyRewardsService } from './my-rewards.service';

/** Announcements, bonuses, workload and the person's own rewards (PRD 3.12, 4.1, 4.7). */
@Controller()
export class EngagementController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly bonuses: BonusesService,
    private readonly capacity: CapacityService,
    private readonly rewards: MyRewardsService,
  ) {}

  @TsRestHandler(apiContract.engagement)
  handler(@CurrentActor() actor: Actor) {
    // Owners and HR post announcements (PRD 4.1).
    const post = () => assertCan(actor, 'people.manage');
    return tsRestHandler(apiContract.engagement, {
      myAnnouncements: async () => ({
        status: 200,
        body: await this.announcements.mine(actor),
      }),
      listAnnouncements: async () => {
        post();
        return { status: 200, body: await this.announcements.list() };
      },
      createAnnouncement: async ({ body }) => {
        post();
        return { status: 201, body: await this.announcements.create(actor, body) };
      },
      endAnnouncement: async ({ params }) => {
        post();
        return { status: 200, body: await this.announcements.end(actor, params.id) };
      },
      listBonuses: async ({ query }) => {
        assertCan(actor, 'people.manage', 'projects.manage', 'finance.approve_payments');
        const filter = query.status ? eq(projectBonuses.status, query.status) : undefined;
        return { status: 200, body: await this.bonuses.list(filter) };
      },
      proposeBonus: async ({ body }) => {
        assertCan(actor, 'people.manage', 'projects.manage');
        return { status: 201, body: await this.bonuses.propose(actor, body) };
      },
      decideBonus: async ({ params, body }) => {
        // Managers decide bonuses within the limit in Settings → Approvals.
        assertCan(actor, 'finance.approve_payments', 'people.manage');
        return {
          status: 200,
          body: await this.bonuses.decide(actor, params.id, body.approve, body.note),
        };
      },
      cancelBonus: async ({ params }) => {
        assertCan(actor, 'people.manage', 'projects.manage', 'finance.approve_payments');
        return { status: 200, body: await this.bonuses.cancel(actor, params.id) };
      },
      myRewards: async () => {
        assertCan(actor, 'attendance.mark', 'leave.request');
        return { status: 200, body: await this.rewards.get(actor.userId) };
      },
      teamCapacity: async () => {
        assertCan(actor, 'people.view', 'people.manage', 'tasks.assign', 'projects.manage');
        return { status: 200, body: await this.capacity.team() };
      },
    });
  }
}
