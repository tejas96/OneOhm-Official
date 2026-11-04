import { type DatabaseExecutor, projects, properties } from '@oneohm/database';
import { and, desc, eq, ne } from 'drizzle-orm';

/**
 * A customer's active projects: every one not cancelled. The one rule the app's home and
 * every WhatsApp answer use (menu audit M7), so a cancelled home is never offered Pay now.
 */
export const activeProjectsOf = (customerId: string) =>
  and(eq(projects.customerId, customerId), ne(projects.status, 'cancelled'));

/** The customer's active homes, newest first, each with its town and site name. */
export function activeHomes(db: DatabaseExecutor, customerId: string) {
  return db
    .select({ id: projects.id, city: properties.city, site: properties.label })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(activeProjectsOf(customerId))
    .orderBy(desc(projects.createdAt));
}
