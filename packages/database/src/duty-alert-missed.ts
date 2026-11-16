import { clockString, plannedVisitMissed, VISIT_MISSED_AFTER_MINUTES } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { tellVisitDelayed } from './customer-visit-delayed';
import { raiseDutyAlert } from './duty-alert-store';
import { serviceCategories } from './schema/after-sales.schema';
import { customers } from './schema/crm.schema';
import { serviceRequests } from './schema/customer-portal.schema';
import { users } from './schema/identity.schema';
import { projectTasks } from './schema/projects.schema';
import { siteVisits } from './schema/site-activity.schema';
import { visits } from './schema/visits.schema';

/** Minutes after midnight in the business time zone. */
export function businessMinutes(at: Date, timeZone: string): number {
  const [hours = 0, minutes = 0] = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  })
    .format(at)
    .split(':')
    .map(Number);
  return hours * 60 + minutes;
}

/** The planned visit's work: the task or the request, the live map's site id. */
const workOf = (visit: typeof visits.$inferSelect) =>
  visit.taskId
    ? { type: 'task' as const, id: visit.taskId, projectId: visit.projectId }
    : { type: 'service_request' as const, id: visit.serviceRequestId as string };

/** Someone already checked in at this work today. */
async function someoneArrived(
  db: DatabaseExecutor,
  visit: typeof visits.$inferSelect,
  today: string,
): Promise<boolean> {
  const work = workOf(visit);
  const [arrived] = await db
    .select({ id: siteVisits.id })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.workDate, today),
        work.type === 'task'
          ? eq(siteVisits.taskId, work.id)
          : eq(siteVisits.serviceRequestId, work.id),
      ),
    )
    .limit(1);
  return Boolean(arrived);
}

/**
 * Today's planned visits with a start time, for a task or a service request, still waiting
 * (proposed or confirmed): 30 minutes past the start with nobody checked in at that work
 * today raises `visit_missed` (red) about the person who should have come (the visit's first
 * crew member, else the work's assignee), so it reaches their manager. The subject is the
 * work itself (the task or request, the live map's site id), never the person, so the feed's
 * "Send nearest" opens that site. A visit with nobody named raises nothing: the live map
 * already shows the site as late. Once closed (reached, cancelled, moved, or by a person) it
 * opens again only when a moved visit's new start is missed too. When the alert is new, the
 * customer hears the team is running late (`tellVisitDelayed`).
 */
export async function missedVisits(
  db: DatabaseExecutor,
  now: Date,
  timeZone: string,
): Promise<number> {
  const today = todayIn(timeZone, now);
  const nowMin = businessMinutes(now, timeZone);
  const planned = await db
    .select({
      visit: visits,
      taskTitle: projectTasks.title,
      taskAssignee: projectTasks.assigneeUserId,
      requestAssignee: serviceRequests.assigneeUserId,
      categoryLabel: serviceCategories.label,
      customerName: customers.name,
      personName: users.fullName,
    })
    .from(visits)
    .leftJoin(projectTasks, eq(projectTasks.id, visits.taskId))
    .leftJoin(serviceRequests, eq(serviceRequests.id, visits.serviceRequestId))
    .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
    .leftJoin(customers, eq(customers.id, visits.customerId))
    .leftJoin(
      users,
      eq(
        users.id,
        sql`coalesce(${visits.crewUserIds}[1], ${projectTasks.assigneeUserId}, ${serviceRequests.assigneeUserId})`,
      ),
    )
    .where(
      and(
        eq(visits.day, today),
        inArray(visits.status, ['proposed', 'confirmed']),
        isNotNull(visits.startMin),
        or(isNotNull(visits.taskId), isNotNull(visits.serviceRequestId)),
      ),
    );
  let raised = 0;
  for (const row of planned) {
    const { visit } = row;
    const personId = visit.crewUserIds[0] ?? row.taskAssignee ?? row.requestAssignee;
    const due = plannedVisitMissed({ plannedStartMin: visit.startMin, nowMin, arrived: false });
    if (!due || !personId || (await someoneArrived(db, visit, today))) continue;
    const work = workOf(visit);
    const label = row.taskTitle ?? row.categoryLabel ?? 'Site visit';
    const start = clockString(visit.startMin ?? 0);
    // The moment it became missed: a closed alert opens again only for a later start.
    const lateBy = nowMin - (visit.startMin ?? 0) - VISIT_MISSED_AFTER_MINUTES;
    const alert = await raiseDutyAlert(db, {
      kind: 'visit_missed',
      personId,
      subjectType: work.type,
      subjectId: work.id,
      day: today,
      title: `${row.customerName ?? label}: nobody yet, visit at ${start}`,
      body: `${label}, with ${row.personName ?? 'nobody'}. Send the nearest person or call.`,
      detail: {
        siteId: work.id,
        visitId: visit.id,
        label,
        customerName: row.customerName,
        plannedStart: start,
      },
      opens: work,
      since: new Date(now.getTime() - lateBy * 60_000),
    });
    if (!alert.created) continue;
    raised += 1;
    // The customer is told too, once per planned visit (Duty Day step 6).
    await tellVisitDelayed(db, visit);
  }
  return raised;
}
