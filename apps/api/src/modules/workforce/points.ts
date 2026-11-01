import {
  type DatabaseExecutor,
  pointsEntries,
  projects,
  roles,
  stageRatingPeople,
  stageRatings,
  userRoles,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, gte, isNull } from 'drizzle-orm';
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

/**
 * Flow G: a customer who names people on a stage rating with 4 or 5 stars suggests
 * points for each of them (staff only; crews show it in their contractor's ratings).
 * A manager approves each, so no rating turns into a reward on its own.
 */
export async function suggestStageRatingPoints(
  db: DatabaseExecutor,
  ratingId: string,
): Promise<number> {
  const named = await db
    .select({
      userId: stageRatingPeople.userId,
      stars: stageRatingPeople.rating,
      stage: stageRatings.stage,
      code: projects.code,
    })
    .from(stageRatingPeople)
    .innerJoin(stageRatings, eq(stageRatings.id, stageRatingPeople.ratingId))
    .innerJoin(projects, eq(projects.id, stageRatings.projectId))
    .where(and(eq(stageRatingPeople.ratingId, ratingId), gte(stageRatingPeople.rating, 4)));
  if (named.length === 0) return 0;
  const { points } = await loadPolicy(db);
  if (points.stageRating <= 0) return 0;
  let suggested = 0;
  for (const person of named) {
    if (!(await isStaff(db, person.userId))) continue;
    const rows = await db
      .insert(pointsEntries)
      .values({
        userId: person.userId,
        points: points.stageRating,
        reason: `${person.stars}-star ${STAGE_WORDS[person.stage] ?? person.stage} rating on ${person.code}`,
        sourceType: 'stage_rating',
        sourceId: ratingId,
        status: 'pending',
      })
      .onConflictDoNothing()
      .returning({ id: pointsEntries.id });
    suggested += rows.length;
  }
  return suggested;
}

const STAGE_WORDS: Readonly<Record<string, string>> = {
  survey: 'site survey',
  installation: 'installation',
  commissioning: 'switch-on',
};
