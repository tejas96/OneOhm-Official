import {
  type DatabaseExecutor,
  projects,
  projectTasks,
  properties,
  visits as visitRows,
} from '@oneohm/database';
import { HOME_VISIT_DAYS } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';

/** The confirmed visits of the next 3 days (Home's visit line), any kind, from the visit record. */
export function upcomingVisits(db: DatabaseExecutor, customerId: string, today: string) {
  return db
    .select({
      id: visitRows.id,
      day: visitRows.day,
      slot: visitRows.slot,
      kind: visitRows.kind,
      serviceRequestId: visitRows.serviceRequestId,
      label: properties.label,
      city: properties.city,
    })
    .from(visitRows)
    .leftJoin(projects, eq(projects.id, visitRows.projectId))
    .leftJoin(projectTasks, eq(projectTasks.id, visitRows.taskId))
    .leftJoin(
      properties,
      eq(properties.id, sql`coalesce(${visitRows.propertyId}, ${projects.propertyId})`),
    )
    .where(
      and(
        eq(visitRows.customerId, customerId),
        eq(visitRows.status, 'confirmed'),
        // A task that does not message customers is not shown to them either (PRD 6.2).
        or(isNull(visitRows.taskId), eq(projectTasks.notifyCustomer, true)),
        gte(visitRows.day, today),
        lte(visitRows.day, addDays(today, HOME_VISIT_DAYS)),
      ),
    )
    .orderBy(asc(visitRows.day), asc(visitRows.slot));
}
