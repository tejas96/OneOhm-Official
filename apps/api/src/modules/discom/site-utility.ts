import { type DatabaseExecutor, projectFacts, projects, type properties } from '@oneohm/database';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

type Property = typeof properties.$inferSelect;

const KEYS = ['consumer_number', 'meter_holder_name', 'sanctioned_capacity_kw'];

/**
 * The site's electricity details as the mismatch rules read them: the property's own,
 * else what the site's projects recorded from the bill (newest first), so a number
 * already on file never suggests a new connection.
 */
export async function siteUtility(db: DatabaseExecutor, property: Property) {
  const rows = await db
    .select({ key: projectFacts.key, value: projectFacts.value })
    .from(projectFacts)
    .innerJoin(projects, eq(projects.id, projectFacts.projectId))
    .where(
      and(
        eq(projects.propertyId, property.id),
        ne(projects.status, 'cancelled'),
        inArray(projectFacts.key, KEYS),
      ),
    )
    .orderBy(desc(projects.createdAt));
  const fact = (key: string) =>
    rows.find((row) => row.key === key && row.value.trim() !== '')?.value.trim() ?? null;
  const kw = Number(fact('sanctioned_capacity_kw'));
  return {
    consumerNumber: property.consumerNumber ?? fact('consumer_number'),
    meterHolderName: property.meterHolderName ?? fact('meter_holder_name'),
    sanctionedLoadW:
      property.sanctionedLoadW ?? (Number.isFinite(kw) && kw > 0 ? Math.round(kw * 1000) : null),
  };
}
