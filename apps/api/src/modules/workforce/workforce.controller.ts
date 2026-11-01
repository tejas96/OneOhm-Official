import { Controller } from '@nestjs/common';
import { attendanceCorrections, leaveRequests } from '@oneohm/database';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { eq } from 'drizzle-orm';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { AttendanceService } from './attendance.service';
import { CorrectionsService } from './corrections.service';
import { LeaveService } from './leave.service';
import { WorkdayService } from './workday.service';

@Controller()
export class WorkforceController {
  constructor(
    private readonly workday: WorkdayService,
    private readonly attendance: AttendanceService,
    private readonly corrections: CorrectionsService,
    private readonly leave: LeaveService,
  ) {}

  @TsRestHandler(apiContract.workforce)
  handler(@CurrentActor() actor: Actor) {
    const mark = () => assertCan(actor, 'attendance.mark');
    const approve = () => assertCan(actor, 'leave.approve');
    const day = async () => ({ status: 200 as const, body: await this.workday.get(actor) });
    return tsRestHandler(apiContract.workforce, {
      myWorkday: async () => {
        mark();
        return day();
      },
      setLocationConsent: async ({ body }) => {
        // Crews check in at sites too, so they answer the same consent.
        assertCan(actor, 'attendance.mark', 'tasks.complete');
        await this.attendance.setConsent(actor, body.given, body.version);
        return day();
      },
      checkIn: async ({ body }) => {
        mark();
        await this.attendance.checkIn(actor, body.position);
        return day();
      },
      checkOut: async ({ body }) => {
        mark();
        await this.attendance.checkOut(actor, body.position);
        return day();
      },
      requestCorrection: async ({ body }) => {
        mark();
        return { status: 201, body: await this.corrections.request(actor, body) };
      },
      listCorrections: async ({ query }) => {
        approve();
        const filter = query.status ? eq(attendanceCorrections.status, query.status) : undefined;
        return { status: 200, body: await this.corrections.list(filter) };
      },
      decideCorrection: async ({ params, body }) => {
        approve();
        return {
          status: 200,
          body: await this.corrections.decide(actor, params.id, body.approve, body.note),
        };
      },
      teamAttendance: async ({ query }) => {
        assertCan(actor, 'people.view', 'leave.approve');
        return { status: 200, body: await this.attendance.team(query.date) };
      },
      myLeave: async () => {
        assertCan(actor, 'leave.request');
        return { status: 200, body: await this.leave.list(eq(leaveRequests.userId, actor.userId)) };
      },
      leaveImpact: async ({ body }) => {
        assertCan(actor, 'leave.request');
        return { status: 200, body: await this.leave.impact(actor, body) };
      },
      applyLeave: async ({ body }) => {
        assertCan(actor, 'leave.request');
        return { status: 201, body: await this.leave.apply(actor, body) };
      },
      cancelLeave: async ({ params }) => {
        assertCan(actor, 'leave.request');
        return { status: 200, body: await this.leave.cancel(actor, params.id) };
      },
      listLeave: async ({ query }) => {
        approve();
        const filter = query.status ? eq(leaveRequests.status, query.status) : undefined;
        return { status: 200, body: await this.leave.list(filter) };
      },
      requestImpact: async ({ params }) => {
        approve();
        return { status: 200, body: await this.leave.requestImpact(params.id) };
      },
      decideLeave: async ({ params, body }) => {
        approve();
        return { status: 200, body: await this.leave.decide(actor, params.id, body) };
      },
    });
  }
}
