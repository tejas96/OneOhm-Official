import { type DatabaseExecutor, projects, projectTasks, warrantyPolicy } from '@oneohm/database';
import {
  COMMISSIONING_TASK_KEY,
  DEFAULT_WARRANTY_POLICY,
  type WarrantyPolicy,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, isNotNull, or } from 'drizzle-orm';

export async function warrantyPolicyOf(db: DatabaseExecutor): Promise<WarrantyPolicy> {
  const [row] = await db.select().from(warrantyPolicy).where(eq(warrantyPolicy.id, 'default'));
  return row?.policy ?? DEFAULT_WARRANTY_POLICY;
}

/** The day testing and commissioning finished, in India; null before it has. */
export async function commissionedOn(
  db: DatabaseExecutor,
  projectId: string,
): Promise<string | null> {
  const [task] = await db
    .select({ at: projectTasks.completedAt })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        or(
          eq(projectTasks.onComplete, 'commissioning_completed'),
          eq(projectTasks.templateKey, COMMISSIONING_TASK_KEY),
        ),
        isNotNull(projectTasks.completedAt),
      ),
    )
    .orderBy(asc(projectTasks.completedAt))
    .limit(1);
  const [project] = await db
    .select({ at: projects.operationalAt })
    .from(projects)
    .where(eq(projects.id, projectId));
  const at = task?.at ?? project?.at ?? null;
  return at ? todayIn('Asia/Kolkata', at) : null;
}
