import { Inject, Injectable } from '@nestjs/common';
import type { TeamCapacity } from '@oneohm/api-contracts';
import { leaveRequests, projectTasks, roles, userRoles, users } from '@oneohm/database';
import { dueByWeek, leaveDaysByWeek, weekWindows } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { workOf } from '../people/person-work';

const WEEKS = 4;

/**
 * Who carries how much (PRD 3.12): each staff member's open tasks against their limit,
 * and what falls due in each of the next four weeks beside their leave.
 */
@Injectable()
export class CapacityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async team(): Promise<TeamCapacity> {
    const today = todayIn();
    const weeks = weekWindows(today, WEEKS);
    const last = weeks[weeks.length - 1]?.to ?? today;
    const staff = await this.db
      .select({ id: users.id, fullName: users.fullName, role: roles.name })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
      .where(eq(users.status, 'active'))
      .orderBy(asc(users.fullName));
    const ids = [...new Set(staff.map((row) => row.id))];
    if (ids.length === 0) return { weeks, people: [] };
    const [tasks, leave, work] = await Promise.all([
      this.db
        .select({
          userId: projectTasks.assigneeUserId,
          dueDate: projectTasks.dueDate,
          status: projectTasks.status,
          waitingParty: projectTasks.waitingParty,
        })
        .from(projectTasks)
        .where(
          and(inArray(projectTasks.assigneeUserId, ids), ne(projectTasks.status, 'completed')),
        ),
      this.db
        .select({
          userId: leaveRequests.userId,
          from: leaveRequests.fromDate,
          to: leaveRequests.toDate,
          halfDay: leaveRequests.halfDay,
          status: leaveRequests.status,
        })
        .from(leaveRequests)
        .where(
          and(
            inArray(leaveRequests.userId, ids),
            inArray(leaveRequests.status, ['pending', 'approved']),
            lte(leaveRequests.fromDate, last),
            gte(leaveRequests.toDate, today),
          ),
        ),
      workOf(this.db, ids),
    ]);
    const people = ids.map((id) => {
      const own = tasks.filter((task) => task.userId === id);
      // Waiting on the customer, bank or DISCOM is not the person's delay (PRD 3.12).
      const overdue = own.filter(
        (task) =>
          task.dueDate < today && !(task.status === 'waiting' && task.waitingParty !== 'internal'),
      ).length;
      const settings = work(id, own.length);
      return {
        user: { id, fullName: staff.find((row) => row.id === id)?.fullName ?? '' },
        roles: staff.filter((row) => row.id === id).map((row) => row.role),
        open: own.length,
        overdue,
        limit: settings.openTaskLimit,
        state: settings.loadState,
        dueByWeek: dueByWeek(
          own.map((task) => task.dueDate),
          weeks,
        ),
        // Only approved leave is time away; pending leave is shown beside it.
        leaveDaysByWeek: leaveDaysByWeek(
          leave.filter((row) => row.userId === id && row.status === 'approved'),
          weeks,
        ),
        pendingLeaveDaysByWeek: leaveDaysByWeek(
          leave.filter((row) => row.userId === id && row.status === 'pending'),
          weeks,
        ),
      };
    });
    const rank = { over: 0, full: 1, ok: 2 } as const;
    people.sort((a, b) => rank[a.state] - rank[b.state] || b.open - a.open);
    return { weeks, people };
  }
}
