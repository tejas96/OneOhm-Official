import { Inject, Injectable } from '@nestjs/common';
import type { DutyDay, DutyDaySegment } from '@oneohm/api-contracts';
import { travelDays, users } from '@oneohm/database';
import {
  dayTimeline,
  dutyWindowEnd,
  locationExpired,
  routeKm,
  type TimelineSegment,
  thinEvenly,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { readDayFacts } from './duty-day-facts';
import { assertMayWatch } from './duty-scope';
import { trackingFor } from './tracking';

const iso = (at: Date) => at.toISOString();
const roundKm = (metres: number) => Math.round(metres / 100) / 10;

function present(segment: TimelineSegment): DutyDaySegment {
  const span = {
    startAt: iso(segment.startAt),
    endAt: iso(segment.endAt),
    minutes: segment.minutes,
  };
  switch (segment.kind) {
    case 'stop': {
      const { centre, place, placeLabel, flagged } = segment.stop;
      return { kind: 'stop', ...span, centre, place, placeLabel, flagged };
    }
    case 'travel':
      return { kind: 'travel', ...span, km: segment.km };
    case 'visit': {
      const { visit } = segment;
      return {
        kind: 'visit',
        ...span,
        visitId: visit.id,
        label: visit.label,
        siteLabel: visit.siteLabel,
        open: visit.endAt === null,
        proof: visit.proof,
        proofReasons: [...visit.proofReasons],
      };
    }
    case 'gap':
      return { kind: 'gap', ...span, reason: segment.reason };
  }
}

/**
 * A person's duty day as stops, travel, visits and gaps (Duty Day step 5), for the live map's
 * side panel and replay. Derived from the day's route and visits every time; nothing new is
 * kept. Who may read it: the same rule as the route (`assertMayWatch`).
 */
@Injectable()
export class DutyDayService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async day(actor: Actor, userId: string, date?: string): Promise<DutyDay> {
    await assertMayWatch(this.db, actor, userId);
    const [person] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!person) throw notFound('This person');
    const now = new Date();
    const { timeZone } = currentCalendar();
    const today = todayIn(timeZone, now);
    const day = date ?? today;
    const tracking = await trackingFor(this.db, userId, now);
    if (day > today) throw invalid('That day has not come yet.', { date: 'In the future.' });
    if (locationExpired(day, today, tracking.policy.attendance.retentionDays))
      throw invalid('Duty days are kept only for the retention period.', { date: 'Too old.' });
    const locationOn =
      tracking.switchedOn &&
      tracking.status.state !== 'no_consent' &&
      tracking.status.state !== 'policy_off';
    const facts = await readDayFacts(this.db, userId, day, now, timeZone);
    const [saved] = await this.db
      .select({ paidM: travelDays.paidM })
      .from(travelDays)
      .where(and(eq(travelDays.userId, userId), eq(travelDays.workDate, day)));
    const base = { userId, date: day, locationOn };
    if (!facts.day)
      return {
        ...base,
        duty: null,
        segments: [],
        totals: {
          routeKm: null,
          paidKm: saved ? roundKm(saved.paidM) : null,
          hoursOnDuty: 0,
          visits: facts.visits.length,
          unknownStopMinutes: 0,
          gapMinutes: 0,
        },
        points: [],
      };
    const start = facts.day.checkInAt;
    const end =
      facts.day.checkOutAt ??
      new Date(Math.min(now.getTime(), dutyWindowEnd(facts.day, now, timeZone)));
    const kept = locationOn ? facts.kept : [];
    const timeline = dayTimeline({
      start,
      end,
      points: kept,
      stops: locationOn ? facts.stops : [],
      visits: facts.visits.map(({ row, record }) => ({
        id: row.id,
        startAt: row.checkInAt,
        endAt: row.checkOutAt,
        label: record.taskTitle ?? record.siteLabel ?? row.kind,
        siteLabel: record.siteLabel,
        proof: row.proof,
        proofReasons: row.proofReasons ?? [],
      })),
      locationOn,
    });
    return {
      ...base,
      duty: {
        startedAt: iso(start),
        endedAt: facts.day.checkOutAt ? iso(facts.day.checkOutAt) : null,
      },
      segments: timeline.segments.map(present),
      totals: {
        routeKm: locationOn
          ? roundKm(routeKm(facts.points, { from: start, to: facts.day.checkOutAt }).routeM)
          : null,
        paidKm: saved ? roundKm(saved.paidM) : null,
        hoursOnDuty: Math.round((end.getTime() - start.getTime()) / 360_000) / 10,
        visits: facts.visits.length,
        unknownStopMinutes: timeline.unknownStopMinutes,
        gapMinutes: timeline.gapMinutes,
      },
      points: thinEvenly(kept).map((point) => ({
        at: iso(point.recordedAt),
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    };
  }
}
