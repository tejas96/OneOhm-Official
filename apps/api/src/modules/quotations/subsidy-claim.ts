import {
  type DatabaseExecutor,
  projectActivities,
  projects,
  type projectTasks,
  properties,
} from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';

/** The task whose completion means the government has paid the subsidy. */
export const SUBSIDY_RELEASE_TASK = 'subsidy_release';

/**
 * One subsidy per property (PRD 3.5): once it is released, the property is marked, so
 * any later quotation for it shows the reason instead of a subsidy. Runs inside the
 * task's completion transaction.
 */
export async function recordSubsidyClaim(
  tx: DatabaseExecutor,
  task: Pick<typeof projectTasks.$inferSelect, 'templateKey' | 'projectId'>,
  userId: string,
): Promise<void> {
  if (task.templateKey !== SUBSIDY_RELEASE_TASK) return;
  const [project] = await tx
    .select({ propertyId: projects.propertyId })
    .from(projects)
    .where(eq(projects.id, task.projectId))
    .limit(1);
  if (!project) return;
  await tx
    .update(properties)
    .set({ subsidyClaimed: true, updatedAt: new Date() })
    .where(eq(properties.id, project.propertyId));
  await tx.insert(projectActivities).values({
    projectId: task.projectId,
    kind: 'subsidy',
    message: 'Subsidy released. The site is marked as having used its one subsidy.',
    userId,
  });
}

/** Staff set it when a subsidy was claimed elsewhere, or clear a mistake (audited). */
export async function setSubsidyClaimed(
  db: DatabaseExecutor,
  actor: Actor,
  propertyId: string,
  claimed: boolean,
): Promise<{ subsidyClaimed: boolean }> {
  const [row] = await db
    .update(properties)
    .set({ subsidyClaimed: claimed, updatedAt: new Date() })
    .where(eq(properties.id, propertyId))
    .returning({ subsidyClaimed: properties.subsidyClaimed });
  if (!row) throw notFound('That property');
  await recordAudit(db, actor.userId, 'property.subsidy_claimed', 'property', propertyId, {
    claimed,
  });
  return row;
}
