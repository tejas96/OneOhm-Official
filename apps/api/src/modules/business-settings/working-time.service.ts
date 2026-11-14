import { Inject, Injectable } from '@nestjs/common';
import type { WorkingTimeRecord, WorkingTimeSaved } from '@oneohm/api-contracts';
import {
  customers,
  holidays,
  invalidateBusinessCalendar,
  leads,
  readBusinessSetting,
  visits,
  workforcePolicy,
} from '@oneohm/database';
import {
  calendarOf,
  OPEN_VISIT_STATUSES,
  type UpcomingVisit,
  visitsOutsideCalendar,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, inArray, notInArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { loadCalendar } from '../../common/calendar';
import { invalid } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { recountOpenLeave } from '../workforce/leave-recount';
import { loadPolicy } from '../workforce/policy';
import { workingTimeErrors } from './working-time-check';

/** At most this many visits are named in the warning; the count is always the full number. */
const WARNING_LIST = 20;

/**
 * Settings → Working time & holidays: the one business calendar. The working days and hours are
 * the workforce policy's (`weeklyOff`, `attendance.dayStart` / `dayEnd` / lunch), so nothing is
 * kept twice; the holidays are their own table.
 */
@Injectable()
export class WorkingTimeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  async get(): Promise<WorkingTimeRecord> {
    const policy = await loadPolicy(this.db);
    const days = await this.db.select().from(holidays).orderBy(asc(holidays.day));
    return {
      weeklyOff: [...policy.weeklyOff],
      dayStart: policy.attendance.dayStart,
      dayEnd: policy.attendance.dayEnd,
      lunchStart: policy.attendance.lunchStart,
      lunchEnd: policy.attendance.lunchEnd,
      holidays: days.map(({ day, name }) => ({ day, name })),
    };
  }

  /**
   * Saves the calendar. It is checked on its own and against the visit times saved in Visits &
   * bookings (closing at 17:00 is refused while a 17:00 visit time exists). Booked visits it
   * leaves outside working time are not touched: they come back as a warning to act on.
   */
  async save(actor: Actor, body: WorkingTimeRecord): Promise<WorkingTimeSaved> {
    const errors = workingTimeErrors(body, await readBusinessSetting(this.db, 'visits'));
    if (Object.keys(errors).length > 0) throw invalid('Check the working time.', errors);
    const before = await this.get();
    const policy = await loadPolicy(this.db);
    const next = {
      ...policy,
      weeklyOff: [...body.weeklyOff].sort(),
      attendance: {
        ...policy.attendance,
        dayStart: body.dayStart,
        dayEnd: body.dayEnd,
        lunchStart: body.lunchStart,
        lunchEnd: body.lunchEnd,
      },
    };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(workforcePolicy)
        .values({ id: 'default', policy: next, updatedByUserId: actor.userId })
        .onConflictDoUpdate({
          target: workforcePolicy.id,
          set: { policy: next, updatedByUserId: actor.userId, updatedAt: new Date() },
        });
      const days = body.holidays.map((holiday) => holiday.day);
      if (days.length === 0) await tx.delete(holidays);
      else await tx.delete(holidays).where(notInArray(holidays.day, days));
      for (const holiday of body.holidays)
        await tx
          .insert(holidays)
          .values(holiday)
          .onConflictDoUpdate({ target: holidays.day, set: { name: holiday.name } });
      // Leave still to come is counted again: a new holiday is never a day of leave.
      await recountOpenLeave(tx, { weeklyOff: next.weeklyOff, holidays: days }, todayIn());
      await recordAudit(
        tx,
        actor.userId,
        'settings.working_time_changed',
        'settings',
        'working_time',
        {
          before,
          after: body,
        },
      );
    });
    invalidateBusinessCalendar();
    await loadCalendar(this.db, this.env.BUSINESS_TIMEZONE);
    return { settings: await this.get(), outside: await this.outside() };
  }

  /** Booked (open) visits from today on that fall outside the saved calendar. */
  async outside(): Promise<WorkingTimeSaved['outside']> {
    const [work, cal] = await Promise.all([
      this.get(),
      loadCalendar(this.db, this.env.BUSINESS_TIMEZONE),
    ]);
    const calendar = calendarOf(
      work,
      cal.timeZone,
      work.holidays.map((holiday) => holiday.day),
    );
    const rows = await this.db
      .select({
        id: visits.id,
        kind: visits.kind,
        day: visits.day,
        startMin: visits.startMin,
        endMin: visits.endMin,
        customer: customers.name,
        lead: leads.name,
      })
      .from(visits)
      .leftJoin(customers, eq(customers.id, visits.customerId))
      .leftJoin(leads, eq(leads.id, visits.leadId))
      .where(
        and(
          inArray(visits.status, [...OPEN_VISIT_STATUSES]),
          gte(visits.day, todayIn(calendar.timeZone)),
        ),
      )
      .orderBy(asc(visits.day), asc(visits.startMin));
    const upcoming: UpcomingVisit[] = rows;
    const out = new Set(visitsOutsideCalendar(calendar, upcoming).map((visit) => visit.id));
    const list = rows.filter((row) => out.has(row.id));
    return {
      count: list.length,
      visits: list.slice(0, WARNING_LIST).map((row) => ({
        id: row.id,
        day: row.day,
        startMin: row.startMin,
        endMin: row.endMin,
        title: `${row.kind[0]?.toUpperCase()}${row.kind.slice(1).replace('_', ' ')} — ${row.customer ?? row.lead ?? 'customer'}`,
      })),
    };
  }
}
