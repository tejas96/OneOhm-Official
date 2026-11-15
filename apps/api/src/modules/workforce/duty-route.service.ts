import { Inject, Injectable } from '@nestjs/common';
import type { DutyRoute } from '@oneohm/api-contracts';
import { attendanceDays, dutyPoints, reportingLines, users } from '@oneohm/database';
import { summariseDutyRoute } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

/** A person's recorded route for a day, for them and for the people who look after them. */
@Injectable()
export class DutyRouteService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Who may read it: the person, their reporting manager (direct line only) and HR
   * (`people.manage`). Nobody else, whatever else they may see (`people.view`,
   * `leave.approve` do not open a route).
   */
  private async assertMayRead(actor: Actor, userId: string): Promise<void> {
    if (actor.userId === userId) return;
    if (can(actor, 'people.manage')) return;
    const [line] = await this.db
      .select({ manager: reportingLines.managerUserId })
      .from(reportingLines)
      .where(eq(reportingLines.userId, userId))
      .limit(1);
    if (line?.manager !== actor.userId) throw forbidden();
  }

  async route(actor: Actor, userId: string, date = todayIn()): Promise<DutyRoute> {
    await this.assertMayRead(actor, userId);
    const [person] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!person) throw notFound('This person');
    const rows = await this.db
      .select({ point: dutyPoints })
      .from(dutyPoints)
      .innerJoin(attendanceDays, eq(attendanceDays.id, dutyPoints.attendanceDayId))
      .where(and(eq(dutyPoints.userId, userId), eq(attendanceDays.workDate, date)))
      .orderBy(asc(dutyPoints.recordedAt), asc(dutyPoints.id));
    const points = rows.map(({ point }) => point);
    const summary = summariseDutyRoute(points);
    return {
      userId,
      date,
      points: points.map((point) => ({
        id: point.id,
        recordedAt: point.recordedAt.toISOString(),
        latitude: point.latitude,
        longitude: point.longitude,
        accuracyM: point.accuracyM,
        speedMps: point.speedMps,
        headingDeg: point.headingDeg,
        altitudeM: point.altitudeM,
        mocked: point.mocked,
        batteryPercent: point.batteryPercent,
        charging: point.charging,
        network: point.network,
      })),
      summary: {
        count: summary.count,
        firstAt: summary.firstAt?.toISOString() ?? null,
        lastAt: summary.lastAt?.toISOString() ?? null,
        mockedCount: summary.mockedCount,
        maxGapMinutes: summary.maxGapMinutes,
      },
    };
  }
}
