import {
  type AssigneeCandidate,
  DEFAULT_SERVICE_CATEGORIES,
  pickAssignee,
  type SlaHours,
  slaDueDates,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { serviceCategories } from './schema/after-sales.schema';
import { serviceRequests } from './schema/customer-portal.schema';
import { roles, userRoles, users } from './schema/identity.schema';
import { leaveRequests } from './schema/workforce.schema';

/** People in this role take service work, least busy first (PRD 3.17, 5.5). */
export const SERVICE_ROLE_KEY = 'service';

/**
 * The service person to give new work to: in the Service role, active, not on leave on
 * the day, with the fewest unresolved requests. Null leaves it for the desk to assign.
 */
export async function serviceAssignee(
  db: DatabaseExecutor,
  onDate: string,
): Promise<string | null> {
  const people = await db
    .selectDistinct({ id: users.id, onLeave: users.onLeave })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(and(eq(users.status, 'active'), eq(roles.key, SERVICE_ROLE_KEY)));
  if (people.length === 0) return null;
  const ids = people.map((person) => person.id);
  const loads = await db
    .select({ userId: serviceRequests.assigneeUserId, open: sql<number>`count(*)::int` })
    .from(serviceRequests)
    .where(
      and(ne(serviceRequests.status, 'resolved'), inArray(serviceRequests.assigneeUserId, ids)),
    )
    .groupBy(serviceRequests.assigneeUserId);
  const leave = await db
    .select({
      userId: leaveRequests.userId,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.status, 'approved'),
        inArray(leaveRequests.userId, ids),
        lte(leaveRequests.fromDate, onDate),
        gte(leaveRequests.toDate, onDate),
      ),
    );
  const candidates: AssigneeCandidate[] = people.map((person) => ({
    userId: person.id,
    roleKeys: [SERVICE_ROLE_KEY],
    onLeave: person.onLeave,
    away: leave.filter((row) => row.userId === person.id),
    openTasks: loads.find((load) => load.userId === person.id)?.open ?? 0,
  }));
  return pickAssignee(candidates, SERVICE_ROLE_KEY, { from: onDate, to: onDate })?.userId ?? null;
}

/** The promised hours for a category, from Settings or the shipped defaults. */
export async function categoryHours(db: DatabaseExecutor, key: string): Promise<SlaHours | null> {
  const [row] = await db
    .select({
      responseHours: serviceCategories.responseHours,
      resolutionHours: serviceCategories.resolutionHours,
    })
    .from(serviceCategories)
    .where(eq(serviceCategories.key, key))
    .limit(1);
  return row ?? DEFAULT_SERVICE_CATEGORIES.find((category) => category.key === key) ?? null;
}

export interface NewServiceWork {
  readonly customerId: string;
  readonly projectId: string | null;
  readonly category: string;
  readonly description: string;
  /** A planned visit's day; its resolution clock starts then. */
  readonly scheduledFor?: string | null;
  readonly now?: Date;
}

/**
 * Opens a service request with its service levels and an owner, the same way for the
 * customer app, WhatsApp and planned maintenance visits. Callers send the alerts.
 */
export async function openServiceRequest(
  db: DatabaseExecutor,
  input: NewServiceWork,
): Promise<{ readonly id: string; readonly assigneeUserId: string | null }> {
  const now = input.now ?? new Date();
  const hours = await categoryHours(db, input.category);
  const due = hours ? slaDueDates(hours, now, input.scheduledFor) : null;
  const assigneeUserId = await serviceAssignee(
    db,
    input.scheduledFor ?? todayIn('Asia/Kolkata', now),
  );
  const [row] = await db
    .insert(serviceRequests)
    .values({
      customerId: input.customerId,
      projectId: input.projectId,
      category: input.category,
      description: input.description,
      assigneeUserId,
      responseDueAt: due?.responseDueAt ?? null,
      resolutionDueAt: due?.resolutionDueAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: serviceRequests.id });
  if (!row) throw new Error('Service request was not saved.');
  return { id: row.id, assigneeUserId };
}
