import { and, asc, eq, gte, inArray, isNull, lte, min, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from './client';
import { dutyAlerts } from './schema/duty-alerts.schema';
import { personWorkSettings, projectBonuses, projectBonusShares } from './schema/engagement.schema';
import { payables } from './schema/finance.schema';
import { employmentEvents, payHistory } from './schema/people-history.schema';
import { siteVisits, travelClaims } from './schema/site-activity.schema';
import { attendanceCorrections, attendanceDays, leaveRequests } from './schema/workforce.schema';

/** The month, and the Monday-to-Sunday weeks it touches. */
export interface MonthSpan {
  readonly start: string;
  readonly end: string;
  readonly wideStart: string;
  readonly wideEnd: string;
}

/** The month sheet's facts for these people, straight from the tables (Duty Day step 7). */
export async function queryMonth(
  db: DatabaseExecutor,
  ids: string[],
  range: MonthSpan,
  timeZone: string,
) {
  const { start, end } = range;
  const inMonth = (column: AnyPgColumn) => and(gte(column, start), lte(column, end));
  const inWide = (column: AnyPgColumn) =>
    and(gte(column, range.wideStart), lte(column, range.wideEnd));
  const [
    pay,
    firstDays,
    days,
    leaves,
    corrections,
    claims,
    bonuses,
    visits,
    alerts,
    events,
    payChanges,
  ] = await Promise.all([
    db
      .select({ userId: personWorkSettings.userId, paise: personWorkSettings.monthlyPayPaise })
      .from(personWorkSettings)
      .where(inArray(personWorkSettings.userId, ids)),
    db
      .select({ userId: attendanceDays.userId, first: min(attendanceDays.workDate) })
      .from(attendanceDays)
      .where(inArray(attendanceDays.userId, ids))
      .groupBy(attendanceDays.userId),
    db
      .select({
        userId: attendanceDays.userId,
        workDate: attendanceDays.workDate,
        checkInAt: attendanceDays.checkInAt,
        checkOutAt: attendanceDays.checkOutAt,
        late: attendanceDays.late,
        autoClosedAt: attendanceDays.autoClosedAt,
        tapDelayed: attendanceDays.tapDelayed,
      })
      .from(attendanceDays)
      // The weeks around the month too: offs are paid by what happened in their week.
      .where(and(inArray(attendanceDays.userId, ids), inWide(attendanceDays.workDate))),
    db
      .select()
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.userId, ids),
          inArray(leaveRequests.status, ['approved', 'pending']),
          lte(leaveRequests.fromDate, range.wideEnd),
          gte(leaveRequests.toDate, range.wideStart),
        ),
      ),
    db
      .select({
        id: attendanceCorrections.id,
        userId: attendanceCorrections.userId,
        workDate: attendanceCorrections.workDate,
      })
      .from(attendanceCorrections)
      .where(
        and(
          inArray(attendanceCorrections.userId, ids),
          eq(attendanceCorrections.status, 'pending'),
          inMonth(attendanceCorrections.workDate),
        ),
      ),
    db
      .select({
        id: travelClaims.id,
        userId: travelClaims.userId,
        workDate: travelClaims.workDate,
        amountPaise: travelClaims.amountPaise,
        status: travelClaims.status,
        payable: payables.status,
      })
      .from(travelClaims)
      .leftJoin(payables, eq(payables.id, travelClaims.payableId))
      .where(
        and(
          inArray(travelClaims.userId, ids),
          inArray(travelClaims.status, ['approved', 'pending']),
          inMonth(travelClaims.workDate),
        ),
      ),
    db
      .select({
        id: projectBonuses.id,
        userId: projectBonusShares.userId,
        amountPaise: projectBonusShares.amountPaise,
        reason: projectBonuses.reason,
        approvedOn: sql<string>`(${projectBonuses.decidedAt} at time zone ${timeZone})::date::text`,
      })
      .from(projectBonusShares)
      .innerJoin(projectBonuses, eq(projectBonuses.id, projectBonusShares.bonusId))
      .where(
        and(
          inArray(projectBonusShares.userId, ids),
          eq(projectBonuses.status, 'approved'),
          sql`(${projectBonuses.decidedAt} at time zone ${timeZone})::date between ${start}::date and ${end}::date`,
        ),
      ),
    db
      .select({ userId: siteVisits.userId, workDate: siteVisits.workDate })
      .from(siteVisits)
      .where(
        and(
          inArray(siteVisits.userId, ids),
          eq(siteVisits.proof, 'doubtful'),
          inMonth(siteVisits.workDate),
        ),
      ),
    db
      .select({
        id: dutyAlerts.id,
        userId: dutyAlerts.personId,
        day: dutyAlerts.day,
        title: dutyAlerts.title,
      })
      .from(dutyAlerts)
      .where(
        and(
          inArray(dutyAlerts.personId, ids),
          isNull(dutyAlerts.resolvedAt),
          inMonth(dutyAlerts.day),
        ),
      ),
    db
      .select({
        userId: employmentEvents.userId,
        kind: employmentEvents.kind,
        day: employmentEvents.day,
      })
      .from(employmentEvents)
      .where(inArray(employmentEvents.userId, ids))
      .orderBy(asc(employmentEvents.day), asc(employmentEvents.createdAt)),
    db
      .select({
        userId: payHistory.userId,
        monthlyPayPaise: payHistory.monthlyPayPaise,
        effectiveFrom: payHistory.effectiveFrom,
      })
      .from(payHistory)
      .where(inArray(payHistory.userId, ids))
      .orderBy(asc(payHistory.effectiveFrom), asc(payHistory.createdAt)),
  ]);
  return {
    pay,
    firstDays,
    days,
    leaves,
    corrections,
    claims,
    bonuses,
    visits,
    alerts,
    events,
    payChanges,
  };
}
