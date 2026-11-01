import { Inject, Injectable } from '@nestjs/common';
import type { MyWorkday } from '@oneohm/api-contracts';
import { leaveRequests, pointsEntries } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { DATABASE, type Database } from '../../config/core.module';
import { AttendanceService } from './attendance.service';
import { loadPolicy } from './policy';
import { trackingFor } from './tracking';
import { balancesOf, readDays, readLeave, readPoints } from './workforce-read';

/** The person's own day for the field app's Today screen (PRD 4.1). */
@Injectable()
export class WorkdayService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly attendance: AttendanceService,
  ) {}

  async get(actor: Actor): Promise<MyWorkday> {
    const today = todayIn();
    const policy = await loadPolicy(this.db);
    const [days, consent, tracking, leave, points] = await Promise.all([
      readDays(this.db, today, [actor.userId]),
      this.attendance.consented(actor.userId),
      trackingFor(this.db, actor.userId),
      readLeave(this.db, policy, eq(leaveRequests.userId, actor.userId)),
      readPoints(
        this.db,
        and(eq(pointsEntries.userId, actor.userId), eq(pointsEntries.status, 'approved')),
        500,
      ),
    ]);
    const month = today.slice(0, 7);
    return {
      today: days.get(actor.userId) ?? null,
      consent: {
        given: consent.given,
        answered: consent.answered,
        at: consent.at?.toISOString() ?? null,
        version: consent.version,
        currentVersion: tracking.status.consentVersion,
      },
      tracking: tracking.status.state,
      attendance: {
        dayStart: policy.attendance.dayStart,
        dayEnd: policy.attendance.dayEnd,
        // On for this person: their own setting, their roles or the company (PRD 4.3).
        captureLocation: tracking.switchedOn,
        retentionDays: policy.attendance.retentionDays,
      },
      balances: balancesOf(
        policy,
        leave.map((item) => item.row),
        today.slice(0, 4),
      ),
      leave: leave
        .map((item) => item.record)
        .filter((record) => record.toDate >= today || record.status === 'pending')
        .slice(0, 10),
      points: {
        total: points.reduce((sum, entry) => sum + entry.points, 0),
        thisMonth: points
          .filter((entry) => entry.createdAt.slice(0, 7) === month)
          .reduce((sum, entry) => sum + entry.points, 0),
        recent: points.slice(0, 8),
      },
    };
  }
}
