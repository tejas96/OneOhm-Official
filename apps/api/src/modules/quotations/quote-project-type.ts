import { type DatabaseExecutor, projectChanges, projects } from '@oneohm/database';
import type { ProjectType, SubsidyCategory } from '@oneohm/domain';
import { eq, or } from 'drizzle-orm';
import { assertVariantOffered } from '../business-settings/project-variant-check';

const PROJECT_TYPE = {
  individual: 'residential',
  society: 'society',
  commercial: 'commercial',
} as const satisfies Record<SubsidyCategory, ProjectType>;

/** The kind of project a quote becomes once accepted, as project setup reads it. */
export function quoteProjectKind(input: {
  readonly subsidyCategory: SubsidyCategory;
  readonly structureType: string;
}): { readonly type: ProjectType; readonly groundMount: boolean } {
  return {
    type: PROJECT_TYPE[input.subsidyCategory],
    groundMount: input.structureType === 'ground_mount',
  };
}

/**
 * A quote may only be made, sent or accepted for a project type the owner offers, so a
 * customer never accepts a quote that can never become a project (Settings → Project types).
 * A quote that already belongs to a running project (a revision) is never stopped.
 */
export async function assertQuoteTypeOffered(
  db: DatabaseExecutor,
  input: { readonly subsidyCategory: SubsidyCategory; readonly structureType: string },
  quotationId?: string,
): Promise<void> {
  if (quotationId && (await belongsToProject(db, quotationId))) return;
  const kind = quoteProjectKind(input);
  await assertVariantOffered(db, kind.type, kind.groundMount);
}

/** A survey revision or a scope-change revision of a running project. */
async function belongsToProject(db: DatabaseExecutor, quotationId: string): Promise<boolean> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(or(eq(projects.quotationId, quotationId), eq(projects.revisionQuotationId, quotationId)))
    .limit(1);
  if (project) return true;
  const [change] = await db
    .select({ id: projectChanges.id })
    .from(projectChanges)
    .where(eq(projectChanges.quotationId, quotationId))
    .limit(1);
  return change !== undefined;
}
