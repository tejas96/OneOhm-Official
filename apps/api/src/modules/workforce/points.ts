import {
  type DatabaseExecutor,
  pointsEntries,
  projects,
  projectTasks,
  roles,
  stageRatingPeople,
  stageRatings,
  userRoles,
} from '@oneohm/database';
import { judgeTask } from '@oneohm/domain';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { loadPolicy } from './policy';
import { taskPointFacts } from './task-point-facts';

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
 * A finished task's points (spec 3.7), for whoever handed it in: on time and, with an
 * approval step, first-time right. Each part leaves one line: its points when earned,
 * 0 with the reason when missed, so nobody ever loses points. Staff only; a task is
 * judged once (the unique key keeps a second run from adding anything).
 */
export async function awardTaskPoints(
  db: DatabaseExecutor,
  task: typeof projectTasks.$inferSelect,
  finishedBy: string,
): Promise<void> {
  const { userId, facts } = await taskPointFacts(db, task, finishedBy);
  if (!(await isStaff(db, userId))) return;
  const { points } = await loadPolicy(db);
  const verdict = judgeTask(facts);
  const lines = [
    { sourceType: 'task_on_time' as const, part: verdict.onTime, value: points.onTimeTask },
    ...(verdict.firstTimeRight
      ? [
          {
            sourceType: 'task_first_time' as const,
            part: verdict.firstTimeRight,
            value: points.firstTimeRight,
          },
        ]
      : []),
  ];
  for (const line of lines)
    await db
      .insert(pointsEntries)
      .values({
        userId,
        points: line.part.earned ? line.value : 0,
        reason: `${line.part.reason}: ${task.title}`,
        sourceType: line.sourceType,
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
