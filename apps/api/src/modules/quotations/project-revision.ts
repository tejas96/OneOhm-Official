import {
  type DatabaseExecutor,
  notifyHolders,
  projectActivities,
  projects,
  quotations,
} from '@oneohm/database';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RevisionOf } from './quotation-numbering';

/** The project waiting on this quotation as its survey revision, if any. */
export async function projectAwaiting(db: DatabaseExecutor, quotationId: string) {
  const [project] = await db
    .select({ id: projects.id, code: projects.code })
    .from(projects)
    .where(eq(projects.revisionQuotationId, quotationId))
    .limit(1);
  return project ?? null;
}

/**
 * After the customer turned a survey revision down, the next quotation for that site
 * is the project's new revision: same number, next revision (PRD 3.5, Flow A step 6).
 */
export async function redraftFor(
  db: DatabaseExecutor,
  propertyId: string,
): Promise<{ projectId: string; revisionOf: RevisionOf } | null> {
  const [project] = await db
    .select({ id: projects.id, quotationId: projects.quotationId })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(
      and(
        eq(quotations.propertyId, propertyId),
        eq(projects.budgetStatus, 'revision_needed'),
        isNull(projects.revisionQuotationId),
      ),
    )
    .limit(1);
  if (!project) return null;
  const [accepted] = await db
    .select({ number: quotations.number })
    .from(quotations)
    .where(eq(quotations.id, project.quotationId));
  if (!accepted) return null;
  const [latest] = await db
    .select({ revision: quotations.revision })
    .from(quotations)
    .where(eq(quotations.number, accepted.number))
    .orderBy(desc(quotations.revision))
    .limit(1);
  return {
    projectId: project.id,
    revisionOf: {
      id: project.quotationId,
      number: accepted.number,
      revision: latest?.revision ?? 1,
    },
  };
}

/** The customer said no to the survey revision: the project waits for a new one. */
export async function revisionTurnedDown(
  db: DatabaseExecutor,
  project: { id: string; code: string },
  quotation: { number: string; revision: number },
  reason: string,
  userId: string,
): Promise<void> {
  await db
    .update(projects)
    .set({ revisionQuotationId: null, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  await db.insert(projectActivities).values({
    projectId: project.id,
    kind: 'budget',
    message: `The customer did not accept revision ${quotation.number} R${quotation.revision}: ${reason}. The next quotation for this site becomes the new revision.`,
    userId,
  });
  await notifyHolders(db, 'projects.manage', {
    kind: 'budget_revision',
    title: `${project.code}: revision not accepted`,
    body: `The customer turned down R${quotation.revision}. Agree a new price and draft the next revision.`,
    subject: { type: 'project', id: project.id },
    dedupeKey: `revision_rejected:${project.id}:${quotation.revision}`,
  });
}

/** The redrafted quotation is now the revision the project waits on. */
export async function linkRevision(
  db: DatabaseExecutor,
  projectId: string,
  quotationId: string,
): Promise<void> {
  await db
    .update(projects)
    .set({ revisionQuotationId: quotationId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
