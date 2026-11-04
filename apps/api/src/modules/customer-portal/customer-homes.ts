import { type DatabaseExecutor, leads, projects, properties } from '@oneohm/database';
import { and, asc, eq, isNotNull, ne, notInArray, or, sql } from 'drizzle-orm';

/** One home of a customer: a property with a live project or an open lead. */
export interface CustomerHome {
  propertyId: string;
  /** The newest project that is not cancelled; null while the home is only a lead. */
  projectId: string | null;
  /** At most 24 characters: a WhatsApp list row title. */
  title: string;
  /** At most 72 characters: a WhatsApp list row description. */
  description: string;
}

const TITLE_MAX = 24;
const DESCRIPTION_MAX = 72;

const fit = (text: string, max: number): string => {
  const letters = Array.from(text);
  return letters.length <= max ? text : `${letters.slice(0, max - 1).join('')}…`;
};

/** The last 4 letters or digits of a consumer number; null for none. */
const ending = (consumerNumber: string | null) =>
  consumerNumber?.replace(/[^A-Za-z0-9]/g, '').slice(-4) || null;

/** How a home reads in a list: its name (or town) and the end of its consumer number. */
export function describeHome(property: {
  label: string | null;
  city: string;
  consumerNumber: string | null;
}): Pick<CustomerHome, 'title' | 'description'> {
  const city = property.city.trim();
  const title = fit(property.label?.trim() || city, TITLE_MAX);
  const end = ending(property.consumerNumber);
  if (!end) return { title, description: fit(city, DESCRIPTION_MAX) };
  const tail = ` · consumer no. ending ${end}`;
  return { title, description: fit(city, DESCRIPTION_MAX - tail.length) + tail };
}

type NamedHome = Parameters<typeof describeHome>[0] & { readonly propertyId: string };

/**
 * How a message names a home: its title, plus the end of its consumer number when another
 * of the customer's homes has the same title ("Pune (consumer no. ending 1234)").
 */
export function homeName(home: NamedHome, homes: readonly NamedHome[]): string {
  const { title } = describeHome(home);
  const twin = homes.some(
    (other) => other.propertyId !== home.propertyId && describeHome(other).title === title,
  );
  const end = twin ? ending(home.consumerNumber) : null;
  return end ? `${title} (consumer no. ending ${end})` : title;
}

/** How a reply names a home: "your home at Pune". */
export const homeLabel = (home: Pick<CustomerHome, 'title'>): string =>
  `your home at ${home.title}`;

/**
 * The customer's homes, newest first. A home is a property with a project that is not
 * cancelled or a lead that is still open; two projects on one property are one home.
 */
export async function customerHomes(
  db: DatabaseExecutor,
  customerId: string,
): Promise<CustomerHome[]> {
  const rows = await db
    .selectDistinctOn([properties.id], {
      propertyId: properties.id,
      projectId: projects.id,
      label: properties.label,
      city: properties.city,
      consumerNumber: properties.consumerNumber,
      since: projects.createdAt,
      addedAt: properties.createdAt,
    })
    .from(properties)
    .leftJoin(
      projects,
      and(eq(projects.propertyId, properties.id), ne(projects.status, 'cancelled')),
    )
    .leftJoin(
      leads,
      and(eq(leads.propertyId, properties.id), notInArray(leads.stage, ['won', 'lost'])),
    )
    .where(
      and(eq(properties.customerId, customerId), or(isNotNull(projects.id), isNotNull(leads.id))),
    )
    // The newest project of each property; a property with only a lead has none.
    .orderBy(asc(properties.id), sql`${projects.createdAt} desc nulls last`);
  return rows
    .sort((a, b) => (b.since ?? b.addedAt).getTime() - (a.since ?? a.addedAt).getTime())
    .map((row) => ({
      propertyId: row.propertyId,
      projectId: row.projectId,
      ...describeHome(row),
    }));
}
