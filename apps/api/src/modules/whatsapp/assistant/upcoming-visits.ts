import { type DatabaseExecutor, projects, properties, visits as visitRows } from '@oneohm/database';
import { HOME_VISIT_DAYS } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

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
    .leftJoin(
      properties,
      eq(properties.id, sql`coalesce(${visitRows.propertyId}, ${projects.propertyId})`),
    )
    .where(
      and(
        eq(visitRows.customerId, customerId),
        eq(visitRows.status, 'confirmed'),
        gte(visitRows.day, today),
        lte(visitRows.day, addDays(today, HOME_VISIT_DAYS)),
      ),
    )
    .orderBy(asc(visitRows.day), asc(visitRows.slot));
}
