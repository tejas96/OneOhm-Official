import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { SiteVisitsService } from './site-visits.service';
import { TravelClaimsService } from './travel-claims.service';

const routes = apiContract.siteActivity;

/** Site check-in and check-out, the day's travel and travel claims (PRD 4.2, 4.3). */
@Controller()
export class SiteActivityController {
  constructor(
    private readonly visits: SiteVisitsService,
    private readonly travel: TravelClaimsService,
  ) {}

  @TsRestHandler(routes)
  handler(@CurrentActor() actor: Actor) {
    const onSite = () => assertCan(actor, 'tasks.complete', 'tasks.view_assigned');
    const claims = () => assertCan(actor, 'attendance.mark');
    const decides = () => assertCan(actor, 'leave.approve');
    return tsRestHandler(routes, {
      taskSite: async ({ params }) => {
        onSite();
        return { status: 200, body: await this.visits.taskSite(actor, params.id) };
      },
      siteCheckIn: async ({ params, body }) => {
        onSite();
        return { status: 200, body: await this.visits.checkIn(actor, params.id, body.position) };
      },
      siteCheckOut: async ({ params, body }) => {
        onSite();
        return { status: 200, body: await this.visits.checkOut(actor, params.id, body.position) };
      },
      saveSiteLocation: async ({ params, body }) => {
        onSite();
        return {
          status: 200,
          body: await this.visits.saveSiteLocation(actor, params.id, body?.pin),
        };
      },
      projectSiteVisits: async ({ params }) => {
        assertCan(actor, 'projects.view_all', 'tasks.approve');
        return { status: 200, body: await this.visits.projectVisits(params.id) };
      },
      myTravel: async ({ query }) => {
        claims();
        return { status: 200, body: await this.travel.day(actor.userId, query.date) };
      },
      myTravelClaims: async () => {
        claims();
        return { status: 200, body: await this.travel.mine(actor) };
      },
      claimTravel: async ({ body }) => {
        claims();
        return {
          status: 201,
          body: await this.travel.claim(actor, body.workDate, body.note, body.projectId),
        };
      },
      cancelTravelClaim: async ({ params }) => {
        claims();
        return { status: 200, body: await this.travel.cancel(actor, params.id) };
      },
      listTravelClaims: async ({ query }) => {
        assertCan(actor, 'leave.approve', 'finance.view');
        return { status: 200, body: await this.travel.list(query) };
      },
      travelClaimDay: async ({ params }) => {
        assertCan(actor, 'leave.approve', 'finance.view');
        return { status: 200, body: await this.travel.dayOfClaim(params.id) };
      },
      decideTravelClaim: async ({ params, body }) => {
        decides();
        return {
          status: 200,
          body: await this.travel.decide(actor, params.id, body.approve, body.note),
        };
      },
    });
  }
}
