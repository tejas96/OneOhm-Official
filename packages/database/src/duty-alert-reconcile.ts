import {
  AUTO_RESOLVED_REASON,
  type CauseNow,
  causeGone,
  SELF_CLOSING_KINDS,
  type SelfClosingKind,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { awayUserIds } from './away-today';
import type { DatabaseExecutor } from './client';
import { businessMinutes } from './duty-alert-missed';
import { resolveDutyAlerts } from './duty-alert-store';
import { dutyAlerts } from './schema/duty-alerts.schema';
import { payables } from './schema/finance.schema';
import { siteVisits, travelClaims } from './schema/site-activity.schema';
import { visits } from './schema/visits.schema';
import { attendanceDays } from './schema/workforce.schema';

/** An open alert the job may close by itself. */
export interface OpenAlert {
  readonly id: string;
  readonly kind: SelfClosingKind;
  readonly personId: string;
  readonly subjectId: string;
  readonly day: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/** What is true now, read for every open alert at once: a few queries, whatever the count. */
export interface AlertFacts {
  /** `person:day` pairs with a check-in. */
  readonly checkedIn: ReadonlySet<string>;
  /** People away (approved leave, or marked on leave), by day. */
  readonly away: ReadonlyMap<string, ReadonlySet<string>>;
  readonly visits: ReadonlyMap<string, { closed: boolean; proof: string | null }>;
  /** `work:day` pairs where someone checked in. */
  readonly arrived: ReadonlySet<string>;
  readonly planned: ReadonlyMap<string, { status: string; day: string; startMin: number | null }>;
  readonly claims: ReadonlyMap<string, { status: string; paid: boolean }>;
}

const pair = (a: string, b: string) => `${a}:${b}`;

/** The alert's cause as it stands now (`causeGone` decides). */
export function causeOf(
  alert: OpenAlert,
  facts: AlertFacts,
  now: { readonly today: string; readonly nowMin: number },
): CauseNow {
  switch (alert.kind) {
    case 'not_checked_in':
      return {
        kind: alert.kind,
        checkedIn: facts.checkedIn.has(pair(alert.personId, alert.day)),
        away: facts.away.get(alert.day)?.has(alert.personId) ?? false,
      };
    case 'visit_open_long':
      return { kind: alert.kind, visitClosed: facts.visits.get(alert.subjectId)?.closed ?? true };
    case 'visit_doubtful':
      return { kind: alert.kind, proof: facts.visits.get(alert.subjectId)?.proof ?? null };
    case 'visit_missed': {
      const visitId = typeof alert.detail.visitId === 'string' ? alert.detail.visitId : '';
      return {
        kind: alert.kind,
        arrived: facts.arrived.has(pair(alert.subjectId, alert.day)),
        planned: facts.planned.get(visitId) ?? null,
        alertDay: alert.day,
        ...now,
      };
    }
    case 'claim_waiting':
      return { kind: alert.kind, status: facts.claims.get(alert.subjectId)?.status ?? null };
    case 'claim_unpaid': {
      const claim = facts.claims.get(alert.subjectId);
      return { kind: alert.kind, status: claim?.status ?? null, paid: claim?.paid ?? false };
    }
  }
}

const ids = (alerts: readonly OpenAlert[], kinds: readonly SelfClosingKind[]) => [
  ...new Set(alerts.filter((alert) => kinds.includes(alert.kind)).map((alert) => alert.subjectId)),
];

async function readFacts(db: DatabaseExecutor, open: readonly OpenAlert[]): Promise<AlertFacts> {
  const unchecked = open.filter((alert) => alert.kind === 'not_checked_in');
  const missed = open.filter((alert) => alert.kind === 'visit_missed');
  const visitIds = ids(open, ['visit_open_long', 'visit_doubtful']);
  const claimIds = ids(open, ['claim_waiting', 'claim_unpaid']);
  const workIds = ids(open, ['visit_missed']);
  const plannedIds = missed.flatMap((alert) =>
    typeof alert.detail.visitId === 'string' ? [alert.detail.visitId] : [],
  );
  const days = (list: readonly OpenAlert[]) => [...new Set(list.map((alert) => alert.day))];
  const [checkIns, away, visitRows, arrivals, plannedRows, claimRows] = await Promise.all([
    unchecked.length === 0
      ? []
      : db
          .select({ userId: attendanceDays.userId, day: attendanceDays.workDate })
          .from(attendanceDays)
          .where(
            and(
              inArray(attendanceDays.userId, [...new Set(unchecked.map((a) => a.personId))]),
              inArray(attendanceDays.workDate, days(unchecked)),
            ),
          ),
    Promise.all(days(unchecked).map(async (day) => [day, await awayUserIds(db, day)] as const)),
    visitIds.length === 0
      ? []
      : db
          .select({ id: siteVisits.id, out: siteVisits.checkOutAt, proof: siteVisits.proof })
          .from(siteVisits)
          .where(inArray(siteVisits.id, visitIds)),
    workIds.length === 0
      ? []
      : db
          .select({
            taskId: siteVisits.taskId,
            requestId: siteVisits.serviceRequestId,
            day: siteVisits.workDate,
          })
          .from(siteVisits)
          .where(
            and(
              or(
                inArray(siteVisits.taskId, workIds),
                inArray(siteVisits.serviceRequestId, workIds),
              ),
              inArray(siteVisits.workDate, days(missed)),
            ),
          ),
    plannedIds.length === 0
      ? []
      : db
          .select({ id: visits.id, status: visits.status, day: visits.day, start: visits.startMin })
          .from(visits)
          .where(inArray(visits.id, plannedIds)),
    claimIds.length === 0
      ? []
      : db
          .select({ id: travelClaims.id, status: travelClaims.status, paid: payables.status })
          .from(travelClaims)
          .leftJoin(payables, eq(payables.id, travelClaims.payableId))
          .where(inArray(travelClaims.id, claimIds)),
  ]);
  return {
    checkedIn: new Set(checkIns.map((row) => pair(row.userId, row.day))),
    away: new Map(away),
    visits: new Map(
      visitRows.map((row) => [row.id, { closed: row.out !== null, proof: row.proof }]),
    ),
    arrived: new Set(
      arrivals.flatMap((row) =>
        [row.taskId, row.requestId].flatMap((id) => (id ? [pair(id, row.day)] : [])),
      ),
    ),
    planned: new Map(
      plannedRows.map((row) => [row.id, { status: row.status, day: row.day, startMin: row.start }]),
    ),
    claims: new Map(
      claimRows.map((row) => [row.id, { status: row.status, paid: row.paid === 'paid' }]),
    ),
  };
}

/**
 * The self-closing pass of the five-minute job (Duty Day step 5): every open alert whose
 * cause can be fixed is checked against what is true now, and closed as `auto` (nobody is
 * told) once it is: checked in or on leave, the visit closed, the planned visit reached,
 * cancelled or moved, the claim decided, withdrawn, voided or paid, the proof verified. One
 * place for every path that fixes a cause (check-in, leave, close, assign, decide, pay), at
 * most five minutes late, and a few queries a run however many alerts are open. Route gaps
 * close on their own path (`applyRouteGap`). Returns how many it closed.
 */
export async function reconcileDutyAlerts(
  db: DatabaseExecutor,
  now: Date,
  timeZone: string,
): Promise<number> {
  const rows = await db
    .select({
      id: dutyAlerts.id,
      kind: dutyAlerts.kind,
      personId: dutyAlerts.personId,
      subjectId: dutyAlerts.subjectId,
      day: dutyAlerts.day,
      detail: dutyAlerts.detail,
    })
    .from(dutyAlerts)
    .where(and(isNull(dutyAlerts.resolvedAt), inArray(dutyAlerts.kind, [...SELF_CLOSING_KINDS])));
  const open = rows as OpenAlert[];
  if (open.length === 0) return 0;
  const facts = await readFacts(db, open);
  const at = { today: todayIn(timeZone, now), nowMin: businessMinutes(now, timeZone) };
  const gone = open.filter((alert) => causeGone(causeOf(alert, facts, at)));
  return resolveDutyAlerts(
    db,
    gone.map((alert) => alert.id),
    AUTO_RESOLVED_REASON,
    now,
  );
}
