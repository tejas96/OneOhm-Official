import { Inject, Injectable } from '@nestjs/common';
import type { BusinessReportQuery, TeamReport } from '@oneohm/api-contracts';
import { bucketIndexOf, onTimeRate, type WorkforcePolicy } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { DATABASE, type Database } from '../../config/core.module';
import { loadPolicy } from '../workforce/policy';
import { type CsvTable, percent } from './csv';
import { type ReportScope, reportScope } from './report-scope';
import {
  leaveWithin,
  readAttendance,
  readCrews,
  readLeave,
  readPeople,
  readTeamTasks,
  type TeamAttendance,
  type TeamLeave,
  type TeamPerson,
  type TeamTask,
} from './team-report.read';

type Work = Omit<TeamReport['crews'][number], 'contractorId' | 'name' | 'members'>;

export interface TeamFacts {
  readonly tasks: readonly TeamTask[];
  readonly people: readonly TeamPerson[];
  readonly crews: readonly { readonly id: string; readonly name: string }[];
  readonly leave: readonly TeamLeave[];
  readonly attendance: readonly TeamAttendance[];
  readonly policy: Pick<WorkforcePolicy, 'weeklyOff' | 'leaveTypes'>;
}

const AWAY_ROWS = 20;
const FOREVER = '9999-12-31';

/** Who is delivering, who is overloaded and who is away (PRD 3.1). */
@Injectable()
export class TeamReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async report(query: BusinessReportQuery): Promise<TeamReport> {
    // The frame hides the manager filter here; drop it even if the address still has one.
    const scope = reportScope({ ...query, managerUserId: undefined });
    const [tasks, people, crews, leave, attendance, policy] = await Promise.all([
      readTeamTasks(this.db, scope),
      readPeople(this.db),
      readCrews(this.db),
      readLeave(this.db, scope.meta.range.start),
      readAttendance(this.db, scope),
      loadPolicy(this.db),
    ]);
    return buildTeam(scope, { tasks, people, crews, leave, attendance, policy });
  }

  csv(report: TeamReport): CsvTable {
    return {
      fileName: `OneOhm team ${report.meta.range.start} to ${report.meta.range.end}`,
      headers: [
        'Person',
        'Designation',
        'Finished',
        'On time',
        'On time %',
        'Open',
        'Past due',
        'Leave days',
        'Days present',
        'Late check-ins',
      ],
      rows: report.people.map((row) => [
        row.name,
        row.designation,
        row.finished,
        row.onTime,
        percent(row.onTimeRate),
        row.open,
        row.pastDue,
        row.leaveHalfDays / 2,
        row.daysPresent,
        row.lateCheckIns,
      ]),
    };
  }
}

/** Finished on time or late (late on others: waiting on customer, bank or DISCOM), open, past due. */
export function tally(tasks: readonly TeamTask[], today: string): Work {
  const finished = tasks.filter((task) => task.finishedOn !== null);
  const onTime = finished.filter((task) => (task.finishedOn ?? '') <= task.dueDate).length;
  const late = finished.filter((task) => (task.finishedOn ?? '') > task.dueDate);
  const open = tasks.filter((task) => task.open);
  return {
    finished: finished.length,
    onTime,
    late: late.length,
    lateOnOthers: late.filter((task) => task.party !== 'internal').length,
    onTimeRate: onTimeRate(onTime, late.length),
    open: open.length,
    pastDue: open.filter((task) => task.dueDate < today).length,
  };
}

const byUser = <T extends { readonly userId: string }>(rows: readonly T[]) => {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.userId, [...(map.get(row.userId) ?? []), row]);
  return map;
};

/** The whole report from its facts; pure, so it is tested without a database. */
export function buildTeam(
  scope: Pick<ReportScope, 'meta' | 'today'>,
  facts: TeamFacts,
): TeamReport {
  const { today, meta } = scope;
  const off = facts.policy.weeklyOff;
  const period = { from: meta.range.start, to: meta.range.end };
  const tasksOf = byUser(facts.tasks);
  const leaveOf = byUser(facts.leave);
  const present = new Map(facts.attendance.map((row) => [row.userId, row]));
  const crewOf = new Map(facts.people.map((person) => [person.id, person.contractorId]));
  const awayToday = (userId: string) =>
    (leaveOf.get(userId) ?? []).some((row) => row.fromDate <= today && row.toDate >= today);
  const staff = facts.people.filter((person) => person.contractorId === null);
  const people = staff
    .map((person) => ({
      userId: person.id,
      name: person.name,
      designation: person.designation,
      onLeaveToday: awayToday(person.id),
      ...tally(tasksOf.get(person.id) ?? [], today),
      leaveHalfDays: (leaveOf.get(person.id) ?? []).reduce(
        (sum, row) => sum + leaveWithin(row, period, off),
        0,
      ),
      daysPresent: present.get(person.id)?.present ?? 0,
      lateCheckIns: present.get(person.id)?.late ?? 0,
    }))
    .filter((row) => row.finished + row.open + row.leaveHalfDays + row.daysPresent > 0)
    .sort(
      (a, b) => b.pastDue - a.pastDue || b.finished - a.finished || a.name.localeCompare(b.name),
    );
  const work = tally(facts.tasks, today);
  const tomorrow = addDays(today, 1);
  return {
    meta,
    totals: {
      ...work,
      peopleBehind: new Set(
        facts.tasks.filter((task) => task.open && task.dueDate < today).map((task) => task.userId),
      ).size,
      leaveHalfDays: people.reduce((sum, row) => sum + row.leaveHalfDays, 0),
      leaveAheadHalfDays: facts.leave
        .filter((row) => !crewOf.get(row.userId))
        .reduce((sum, row) => sum + leaveWithin(row, { from: tomorrow, to: FOREVER }, off), 0),
      awayToday: staff.filter((person) => awayToday(person.id)).length,
      daysPresent: people.reduce((sum, row) => sum + row.daysPresent, 0),
      lateCheckIns: people.reduce((sum, row) => sum + row.lateCheckIns, 0),
      peopleCheckedIn: people.filter((row) => row.daysPresent > 0).length,
    },
    byBucket: teamBuckets(scope, facts.tasks, crewOf),
    people,
    crews: crewRows(facts, tasksOf, today),
    away: awayRows(facts, crewOf, today),
  };
}

function teamBuckets(
  scope: Pick<ReportScope, 'meta'>,
  tasks: readonly TeamTask[],
  crewOf: ReadonlyMap<string, string | null>,
) {
  const rows = scope.meta.buckets.map((bucket) => ({
    ...bucket,
    staffOnTime: 0,
    staffLate: 0,
    crewOnTime: 0,
    crewLate: 0,
  }));
  for (const task of tasks) {
    if (!task.finishedOn) continue;
    const row = rows[bucketIndexOf(scope.meta.buckets, task.finishedOn)];
    if (!row) continue;
    const crew = Boolean(crewOf.get(task.userId));
    const onTime = task.finishedOn <= task.dueDate;
    if (crew) row[onTime ? 'crewOnTime' : 'crewLate'] += 1;
    else row[onTime ? 'staffOnTime' : 'staffLate'] += 1;
  }
  return rows;
}

function crewRows(facts: TeamFacts, tasksOf: ReadonlyMap<string, TeamTask[]>, today: string) {
  return facts.crews
    .map((crew) => {
      const members = facts.people.filter((person) => person.contractorId === crew.id);
      return {
        contractorId: crew.id,
        name: crew.name,
        members: members.length,
        ...tally(
          members.flatMap((member) => tasksOf.get(member.id) ?? []),
          today,
        ),
      };
    })
    .filter((row) => row.finished + row.open > 0)
    .sort((a, b) => b.pastDue - a.pastDue || b.open - a.open || a.name.localeCompare(b.name));
}

function awayRows(facts: TeamFacts, crewOf: ReadonlyMap<string, string | null>, today: string) {
  const label = new Map(facts.policy.leaveTypes.map((type) => [type.key, type.label]));
  return facts.leave
    .filter((row) => row.toDate >= today && !crewOf.get(row.userId))
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.name.localeCompare(b.name))
    .slice(0, AWAY_ROWS)
    .map((row) => ({
      requestId: row.id,
      userId: row.userId,
      name: row.name,
      leaveType: label.get(row.leaveType) ?? row.leaveType,
      fromDate: row.fromDate,
      toDate: row.toDate,
      halfDays: row.halfDays,
      today: row.fromDate <= today,
    }));
}
