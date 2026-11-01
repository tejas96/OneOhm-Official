import { type DatabaseExecutor, pointsEntries, projects, roles, userRoles } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { loadPolicy } from './policy';

/** Points are for staff; partner crews and resellers are paid, not scored (PRD 3.12). */
async function isStaff(db: DatabaseExecutor, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: roles.id })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(and(eq(userRoles.userId, userId), eq(roles.kind, 'staff')))
    .limit(1);
  return Boolean(row);
}

/**
 * A task finished on or before its due date earns its owner the on-time points, once.
 * Late work earns nothing and loses nothing, so delays caused by customers, banks or
 * the DISCOM never count against anyone (PRD 3.12).
 */
export async function awardOnTimeTask(
  db: DatabaseExecutor,
  task: {
    readonly id: string;
    readonly title: string;
    readonly assigneeUserId: string | null;
    readonly dueDate: string;
  },
): Promise<void> {
  if (!task.assigneeUserId) return;
  if (todayIn() > task.dueDate) return;
  const { points } = await loadPolicy(db);
  if (points.onTimeTask <= 0 || !(await isStaff(db, task.assigneeUserId))) return;
  await db
    .insert(pointsEntries)
    .values({
      userId: task.assigneeUserId,
      points: points.onTimeTask,
      reason: `On time: ${task.title}`,
      sourceType: 'task_on_time',
      sourceId: task.id,
      status: 'approved',
    })
    .onConflictDoNothing();
}

/**
 * A 4 or 5 star customer rating suggests points for the project manager; a manager
 * approves it, so ratings cannot be gamed into automatic rewards (PRD 5.7, Flow G).
 */
export async function suggestRatingPoints(
  db: DatabaseExecutor,
  input: { readonly projectId: string; readonly rating: number },
): Promise<void> {
  if (input.rating < 4) return;
  const [project] = await db
    .select({ managerUserId: projects.managerUserId, code: projects.code })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  if (!project?.managerUserId) return;
  const { points } = await loadPolicy(db);
  if (points.goodRating <= 0) return;
  await db
    .insert(pointsEntries)
    .values({
      userId: project.managerUserId,
      points: points.goodRating,
      reason: `${input.rating}-star customer rating on ${project.code}`,
      sourceType: 'customer_rating',
      sourceId: input.projectId,
      status: 'pending',
    })
    .onConflictDoNothing();
}
