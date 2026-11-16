import {
  employmentPeriods,
  type MonthPersonFacts,
  type MonthRules,
  monthRulesFrom,
  payOn,
} from '@oneohm/domain';
import { addDays, monthRange } from '@oneohm/shared';
import { and, gte, lte } from 'drizzle-orm';
import { readBusinessCalendar } from './business-calendar';
import type { DatabaseExecutor } from './client';
import type { MonthPerson } from './month-sheet-people';
import { type MonthSpan, queryMonth } from './month-sheet-queries';
import { holidays } from './schema/workforce.schema';
import { currentWorkforcePolicy } from './travel-snapshot';

/** The records behind a person's numbers, so each flag can open the right place. */
export interface MonthRefs {
  readonly corrections: { id: string; workDate: string }[];
  readonly alerts: { id: string; day: string; title: string }[];
  readonly leaves: MonthPersonFacts['leaves'];
}

export interface MonthFacts {
  readonly rules: MonthRules;
  readonly people: ReadonlyMap<string, MonthPersonFacts>;
  readonly refs: ReadonlyMap<string, MonthRefs>;
}

const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The month and the Monday-to-Sunday weeks it touches. */
export function monthSpan(month: string): MonthSpan {
  const { start, end } = monthRange(month);
  return {
    start,
    end,
    wideStart: addDays(start, -((weekday(start) + 6) % 7)),
    wideEnd: addDays(end, (7 - weekday(end)) % 7),
  };
}

/** The sheet's rules for a month: the workforce policy, weekly offs and the holidays around it. */
export async function monthRules(
  db: DatabaseExecutor,
  month: string,
  today: string,
): Promise<MonthRules> {
  const span = monthSpan(month);
  const [policy, calendar, days] = await Promise.all([
    currentWorkforcePolicy(db),
    readBusinessCalendar(db),
    db
      .select({ day: holidays.day, name: holidays.name })
      .from(holidays)
      .where(and(gte(holidays.day, span.wideStart), lte(holidays.day, span.wideEnd))),
  ]);
  return monthRulesFrom({ month, today, policy, calendar, holidays: days });
}

/** The pay in force on the day from the pay history; the saved pay when there is no history. */
function payFor(
  changes: readonly { monthlyPayPaise: number | null; effectiveFrom: string }[] | undefined,
  saved: { paise: number | null } | undefined,
  day: string,
): number | null {
  if (changes?.length) return payOn(changes, day);
  return saved?.paise ?? null;
}

const group = <T extends { userId: string }>(rows: readonly T[]) => {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.userId, [...(map.get(row.userId) ?? []), row]);
  return map;
};

/**
 * Everything the month sheet counts for these people in one month (Duty Day step 7):
 * attendance and leave (with the weeks around the month, for the offs rule), waiting
 * corrections, travel claims by work date, bonuses approved in the month, doubtful visits,
 * open duty alerts, employment periods (joined, left, rejoined) and the pay in force.
 */
export async function readMonthFacts(
  db: DatabaseExecutor,
  month: string,
  today: string,
  people: readonly MonthPerson[],
): Promise<MonthFacts> {
  const rules = await monthRules(db, month, today);
  const ids = people.map((person) => person.id);
  if (ids.length === 0) return { rules, people: new Map(), refs: new Map() };
  const span = monthSpan(month);
  const timeZone = (await readBusinessCalendar(db)).timeZone;
  const found = await queryMonth(db, ids, span, timeZone);
  const by = {
    days: group(found.days),
    leaves: group(found.leaves),
    corrections: group(found.corrections),
    claims: group(found.claims),
    bonuses: group(found.bonuses),
    visits: group(found.visits),
    alerts: group(found.alerts),
    events: group(found.events),
    pay: group(found.payChanges),
  };
  const payDay = today < span.end ? today : span.end;
  const facts = new Map<string, MonthPersonFacts>();
  const refs = new Map<string, MonthRefs>();
  for (const person of people) {
    const id = person.id;
    const first = found.firstDays.find((row) => row.userId === id)?.first ?? null;
    const joined = first && first < person.addedOn ? first : person.addedOn;
    const leaves = (by.leaves.get(id) ?? []).map((leave) => ({
      id: leave.id,
      leaveType: leave.leaveType,
      fromDate: leave.fromDate,
      toDate: leave.toDate,
      halfDay: leave.halfDay,
      status: leave.status as 'approved' | 'pending',
      paid: leave.paid,
    }));
    const corrections = by.corrections.get(id) ?? [];
    const alerts = by.alerts.get(id) ?? [];
    facts.set(id, {
      userId: id,
      periods: employmentPeriods(joined, by.events.get(id) ?? [], person.leftOn),
      monthlyPayPaise: payFor(
        by.pay.get(id),
        found.pay.find((row) => row.userId === id),
        payDay,
      ),
      attendance: (by.days.get(id) ?? []).map((day) => ({
        workDate: day.workDate,
        checkInAt: day.checkInAt,
        checkOutAt: day.checkOutAt,
        late: day.late,
        autoClosed: day.autoClosedAt !== null,
        tapDelayed: day.tapDelayed,
      })),
      leaves,
      openCorrections: corrections.map((row) => row.workDate),
      claims: (by.claims.get(id) ?? []).map((claim) => ({
        id: claim.id,
        workDate: claim.workDate,
        amountPaise: claim.amountPaise,
        status: claim.status as 'approved' | 'pending',
        paid: claim.payable === 'paid',
      })),
      bonuses: (by.bonuses.get(id) ?? []).map(({ userId: _user, ...bonus }) => bonus),
      doubtfulVisits: (by.visits.get(id) ?? []).map((visit) => visit.workDate),
      openAlerts: alerts.map((alert) => alert.day),
    });
    refs.set(id, {
      corrections: corrections.map(({ id: rowId, workDate }) => ({ id: rowId, workDate })),
      alerts: alerts.map(({ id: rowId, day, title }) => ({ id: rowId, day, title })),
      leaves: leaves.filter((leave) => leave.fromDate <= span.end && leave.toDate >= span.start),
    });
  }
  return { rules, people: facts, refs };
}
