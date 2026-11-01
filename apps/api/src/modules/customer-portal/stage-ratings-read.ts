import type { CustomerStageCard, StageRating } from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractors,
  type DatabaseExecutor,
  projects,
  projectTasks,
  stageRatingPeople,
  stageRatings,
  users,
} from '@oneohm/database';
import { isRatedStage, RATED_STAGES, type RatedStage, stageDone } from '@oneohm/domain';
import { and, desc, eq, inArray, isNotNull, ne, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const replier = alias(users, 'replier');

type Person = StageRating['people'][number];

/** People who completed tasks in each stage of each project, by project then stage. */
export async function stageWorkers(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<Map<string, Map<string, Person[]>>> {
  const result = new Map<string, Map<string, Person[]>>();
  if (projectIds.length === 0) return result;
  const rows = await db
    .selectDistinct({
      projectId: projectTasks.projectId,
      stage: projectTasks.stage,
      userId: users.id,
      name: users.fullName,
      crew: contractors.name,
    })
    .from(projectTasks)
    .innerJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
    .leftJoin(contractors, eq(contractors.id, contractorMembers.contractorId))
    .where(
      and(
        inArray(projectTasks.projectId, [...projectIds]),
        eq(projectTasks.status, 'completed'),
        isNotNull(projectTasks.assigneeUserId),
      ),
    );
  for (const row of rows) {
    const byStage = result.get(row.projectId) ?? new Map<string, Person[]>();
    byStage.set(row.stage, [
      ...(byStage.get(row.stage) ?? []),
      { userId: row.userId, name: row.name, crew: row.crew, rating: null },
    ]);
    result.set(row.projectId, byStage);
  }
  return result;
}

/** Ratings matching `where`, newest first, with the people rated in each. */
export async function readStageRatings(
  db: DatabaseExecutor,
  where: SQL | undefined,
): Promise<StageRating[]> {
  const rows = await db
    .select({ rating: stageRatings, code: projects.code, repliedBy: replier.fullName })
    .from(stageRatings)
    .innerJoin(projects, eq(projects.id, stageRatings.projectId))
    .leftJoin(replier, eq(replier.id, stageRatings.repliedByUserId))
    .where(where)
    .orderBy(desc(stageRatings.createdAt));
  const ids = rows.map((row) => row.rating.id);
  const people = ids.length
    ? await db
        .select({
          ratingId: stageRatingPeople.ratingId,
          userId: users.id,
          name: users.fullName,
          crew: contractors.name,
          rating: stageRatingPeople.rating,
        })
        .from(stageRatingPeople)
        .innerJoin(users, eq(users.id, stageRatingPeople.userId))
        .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
        .leftJoin(contractors, eq(contractors.id, contractorMembers.contractorId))
        .where(inArray(stageRatingPeople.ratingId, ids))
    : [];
  return rows
    .filter((row) => isRatedStage(row.rating.stage))
    .map(({ rating, code, repliedBy }) => ({
      id: rating.id,
      projectId: rating.projectId,
      projectCode: code,
      stage: rating.stage as RatedStage,
      rating: rating.rating,
      comment: rating.comment,
      reply: rating.reply,
      repliedBy,
      repliedAt: rating.repliedAt?.toISOString() ?? null,
      createdAt: rating.createdAt.toISOString(),
      people: people
        .filter((person) => person.ratingId === rating.id)
        .map(({ ratingId: _id, ...person }) => person),
    }));
}

/** The customer's view: each finished stage, rated or waiting for stars. */
export async function customerStageCards(
  db: DatabaseExecutor,
  customerId: string,
): Promise<CustomerStageCard[]> {
  const own = await db
    .select({ id: projects.id, code: projects.code })
    .from(projects)
    .where(and(eq(projects.customerId, customerId), ne(projects.status, 'cancelled')));
  if (own.length === 0) return [];
  const ids = own.map((project) => project.id);
  const tasks = await db
    .select({
      projectId: projectTasks.projectId,
      stage: projectTasks.stage,
      status: projectTasks.status,
    })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, ids));
  const workers = await stageWorkers(db, ids);
  const given = await readStageRatings(db, eq(stageRatings.customerId, customerId));
  const cards: CustomerStageCard[] = [];
  for (const project of own) {
    const projectTasksList = tasks.filter((task) => task.projectId === project.id);
    for (const stage of RATED_STAGES) {
      const rating = given.find((item) => item.projectId === project.id && item.stage === stage);
      if (!rating && !stageDone(projectTasksList, stage)) continue;
      cards.push({
        projectId: project.id,
        projectCode: project.code,
        stage,
        people: workers.get(project.id)?.get(stage) ?? [],
        rating: rating ?? null,
      });
    }
  }
  return cards;
}
