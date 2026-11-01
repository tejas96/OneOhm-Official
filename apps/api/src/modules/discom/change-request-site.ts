import {
  customers,
  type DatabaseExecutor,
  discoms,
  documents,
  projects,
  properties,
} from '@oneohm/database';
import { defaultDiscomId } from '@oneohm/domain';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { invalid, notFound } from '../../common/http/errors';

export interface RequestScope {
  readonly propertyId?: string | undefined;
  readonly projectId?: string | null | undefined;
  /** Picked in the form when the site has no DISCOM yet. */
  readonly discomId?: string | undefined;
}

export interface RequestSite {
  readonly property: typeof properties.$inferSelect;
  readonly customer: typeof customers.$inferSelect;
  /** The named project, else the site's latest one. */
  readonly project: { readonly id: string; readonly discomId: string } | null;
  /**
   * The DISCOM whose change requests apply: the site's own, else its project's, else the
   * one picked in the form, else the company's only active DISCOM. Null when unknown.
   */
  readonly discom: { readonly id: string; readonly code: string; readonly name: string } | null;
  /** True when the site itself has no DISCOM recorded. */
  readonly siteHasNoDiscom: boolean;
}

/** The site: as given, or the project's when only the project is named. */
async function propertyIdOf(db: DatabaseExecutor, scope: RequestScope): Promise<string> {
  if (scope.propertyId) return scope.propertyId;
  if (!scope.projectId) throw invalid('Pick the site.', { propertyId: 'Pick the site.' });
  const [project] = await db
    .select({ propertyId: projects.propertyId })
    .from(projects)
    .where(eq(projects.id, scope.projectId));
  if (!project) throw notFound('That project');
  return project.propertyId;
}

async function discomOf(db: DatabaseExecutor, preferred: string | null) {
  const all = await db
    .select({ id: discoms.id, code: discoms.code, name: discoms.name, active: discoms.active })
    .from(discoms);
  const id = preferred ?? defaultDiscomId(all, null);
  const found = all.find((discom) => discom.id === id);
  return found ? { id: found.id, code: found.code, name: found.name } : null;
}

/** Where a change request is raised: site, customer, project and the DISCOM it goes to. */
export async function requestSite(db: DatabaseExecutor, scope: RequestScope): Promise<RequestSite> {
  const propertyId = await propertyIdOf(db, scope);
  const [row] = await db
    .select({ property: properties, customer: customers })
    .from(properties)
    .innerJoin(customers, eq(customers.id, properties.customerId))
    .where(eq(properties.id, propertyId));
  if (!row) throw notFound('That site');
  const [project] = await db
    .select({ id: projects.id, propertyId: projects.propertyId, discomId: projects.discomId })
    .from(projects)
    .where(scope.projectId ? eq(projects.id, scope.projectId) : eq(projects.propertyId, propertyId))
    .orderBy(desc(projects.createdAt))
    .limit(1);
  if (scope.projectId) {
    if (!project) throw notFound('That project');
    if (project.propertyId !== propertyId) throw invalid('That project is on a different site.');
  }
  const preferred = row.property.discomId ?? project?.discomId ?? scope.discomId ?? null;
  return {
    ...row,
    project: project ? { id: project.id, discomId: project.discomId } : null,
    discom: await discomOf(db, preferred),
    siteHasNoDiscom: row.property.discomId === null,
  };
}

/** The document categories on file for the customer or this site (current copies only). */
export async function papersOnFile(
  db: DatabaseExecutor,
  site: Pick<RequestSite, 'property' | 'customer'>,
  categories: readonly string[],
): Promise<Set<string>> {
  if (categories.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ category: documents.category })
    .from(documents)
    .where(
      and(
        or(eq(documents.customerId, site.customer.id), eq(documents.propertyId, site.property.id)),
        inArray(documents.category, [...categories]),
        isNull(documents.replacedAt),
        isNull(documents.removedAt),
      ),
    );
  return new Set(rows.map((row) => row.category));
}
