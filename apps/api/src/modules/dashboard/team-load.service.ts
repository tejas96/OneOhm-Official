import { Inject, Injectable } from '@nestjs/common';
import type {
  CommandCenterQuery,
  TaskBoard,
  TaskBoardQuery,
  TeamLoad,
} from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractors,
  leaveRequests,
  projects,
  projectTasks,
  roles,
  stageRatingPeople,
  userRoles,
  users,
} from '@oneohm/database';
import { ratingSummary } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { centerScope } from './command-center-scope';
import { taskBoard } from './task-board.read';

interface Counts {
  open: number;
  overdue: number;
  dueToday: number;
  done: number;
  onTime: number;
  lateOnOthers: number;
}

/** On-time share of finished work, leaving out work made late by others (PRD 3.12). */
const percent = (counts: Counts) => {
  const rated = counts.done - counts.lateOnOthers;
  return rated > 0 ? Math.round((counts.onTime * 100) / rated) : null;
};

/**
 * Work per person and per contractor crew over the command centre's projects and period,
 * so the owner sees who carries the load and who is falling behind (PRD 3.1).
 */
@Injectable()
export class TeamLoadService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The tasks behind a count, across projects (see `taskBoard`). */
  tasks(query: TaskBoardQuery): Promise<TaskBoard> {
    return taskBoard(this.db, query);
  }

  async load(query: CommandCenterQuery): Promise<TeamLoad> {
    const today = todayIn();
    const scope = centerScope(query, today);
    const rows = await this.db
      .select({
        userId: projectTasks.assigneeUserId,
        open: sql<number>`count(*) filter (where ${projectTasks.status} <> 'completed')::int`,
        // Waiting on the customer, bank or DISCOM is not the person's delay (PRD 3.12).
        overdue: sql<number>`count(*) filter (where ${projectTasks.status} <> 'completed' and ${projectTasks.dueDate} < ${today} and not (${projectTasks.status} = 'waiting' and ${projectTasks.waitingParty} <> 'internal'))::int`,
        dueToday: sql<number>`count(*) filter (where ${projectTasks.status} <> 'completed' and ${projectTasks.dueDate} = ${today})::int`,
        done: sql<number>`count(*) filter (where ${projectTasks.completedAt} >= ${`${scope.start}T00:00:00+05:30`}::timestamptz)::int`,
        // Finished late because of the customer, bank or DISCOM: left out of the rate.
        lateOnOthers: sql<number>`count(*) filter (where ${projectTasks.completedAt} >= ${`${scope.start}T00:00:00+05:30`}::timestamptz and (${projectTasks.completedAt} at time zone 'Asia/Kolkata')::date > ${projectTasks.dueDate} and ${projectTasks.waitingParty} <> 'internal')::int`,
        onTime: sql<number>`count(*) filter (where ${projectTasks.completedAt} >= ${`${scope.start}T00:00:00+05:30`}::timestamptz and (${projectTasks.completedAt} at time zone 'Asia/Kolkata')::date <= ${projectTasks.dueDate})::int`,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(and(scope.projects, isNotNull(projectTasks.assigneeUserId)))
      .groupBy(projectTasks.assigneeUserId);
    const people = await this.db
      .select({ id: users.id, name: users.fullName, contractorId: contractorMembers.contractorId })
      .from(users)
      .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
      .where(eq(users.status, 'active'));
    const away = await this.db
      .select({ userId: leaveRequests.userId })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.fromDate, today),
          gte(leaveRequests.toDate, today),
        ),
      );
    const crews = await this.db
      .select({ id: contractors.id, name: contractors.name })
      .from(contractors);
    const stars = await this.db
      .select({ userId: stageRatingPeople.userId, rating: stageRatingPeople.rating })
      .from(stageRatingPeople);
    const departments = await mainRoles(this.db);
    const starsOf = (ids: readonly string[]) =>
      ratingSummary(stars.filter((row) => ids.includes(row.userId)).map((row) => row.rating));
    const byUser = new Map(rows.map((row) => [row.userId, row]));
    const awayIds = new Set(away.map((row) => row.userId));
    const empty: Counts = { open: 0, overdue: 0, dueToday: 0, done: 0, onTime: 0, lateOnOthers: 0 };
    const staff = people
      .filter((person) => !person.contractorId)
      .map((person) => {
        const counts = byUser.get(person.id) ?? empty;
        return {
          userId: person.id,
          name: person.name,
          department: departments.get(person.id) ?? null,
          onLeaveToday: awayIds.has(person.id),
          open: counts.open,
          overdue: counts.overdue,
          dueToday: counts.dueToday,
          done: counts.done,
          onTimePercent: percent(counts),
          ...summaryFields(starsOf([person.id])),
        };
      })
      .filter((person) => person.open + person.done > 0)
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    const contractorRows = crews
      .map((crew) => {
        const members = people.filter((person) => person.contractorId === crew.id);
        const counts = members.reduce<Counts>(
          (sum, member) => addCounts(sum, byUser.get(member.id) ?? empty),
          empty,
        );
        return {
          contractorId: crew.id,
          name: crew.name,
          crew: members.length,
          open: counts.open,
          overdue: counts.overdue,
          dueToday: counts.dueToday,
          done: counts.done,
          onTimePercent: percent(counts),
          ...summaryFields(starsOf(members.map((member) => member.id))),
        };
      })
      .filter((crew) => crew.open + crew.done > 0)
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    const groups = new Map<string, string[]>();
    for (const person of staff) {
      const name = person.department ?? '';
      groups.set(name, [...(groups.get(name) ?? []), person.userId]);
    }
    const departmentRows = [...groups].map(([department, ids]) => {
      const counts = ids.reduce<Counts>(
        (sum, id) => addCounts(sum, byUser.get(id) ?? empty),
        empty,
      );
      return {
        department: department || null,
        people: ids.length,
        open: counts.open,
        overdue: counts.overdue,
        dueToday: counts.dueToday,
        done: counts.done,
        onTimePercent: percent(counts),
        ...summaryFields(starsOf(ids)),
      };
    });
    departmentRows.sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    return { people: staff, departments: departmentRows, contractors: contractorRows };
  }
}

const addCounts = (sum: Counts, row: Counts): Counts => ({
  open: sum.open + row.open,
  overdue: sum.overdue + row.overdue,
  dueToday: sum.dueToday + row.dueToday,
  done: sum.done + row.done,
  onTime: sum.onTime + row.onTime,
  lateOnOthers: sum.lateOnOthers + row.lateOnOthers,
});

const summaryFields = (summary: { average: number | null; count: number }) => ({
  rating: summary.average,
  ratings: summary.count,
});

/**
 * Each person's main role, used as their department in the drill-down: OneOhm keeps no
 * department field, so it is the first role they were given (PRD 3.1).
 */
async function mainRoles(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({ userId: userRoles.userId, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .orderBy(asc(userRoles.createdAt), asc(roles.name));
  const main = new Map<string, string>();
  for (const row of rows) if (!main.has(row.userId)) main.set(row.userId, row.name);
  return main;
}
