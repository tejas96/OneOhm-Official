import type { MonthlyPerson, MonthlyReview, MonthlyRow } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  monthlyReviews,
  pointsEntries,
  projectBonuses,
  projects,
  projectTasks,
  stageRatingPeople,
  stageRatings,
  users,
} from '@oneohm/database';
import { monthRange, previousMonth } from '@oneohm/shared';
import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';

/** A point line's India day falls in the month. */
export function inMonth(column: typeof pointsEntries.createdAt, month: string): SQL {
  const { start, end } = monthRange(month);
  return sql`(${column} at time zone 'Asia/Kolkata')::date between ${start}::date and ${end}::date`;
}

/** A judged part counts as earned unless its reason says it was not (spec 3.7). */
export const earned = (reason: string) => !reason.includes('not earned');
const rate = (hit: number, of: number) => (of === 0 ? null : hit / of);

/** Points and rates per person from their month's lines. */
export function monthTotals(
  lines: readonly { sourceType: string; points: number; reason: string }[],
) {
  const onTime = lines.filter((line) => line.sourceType === 'task_on_time');
  const first = lines.filter((line) => line.sourceType === 'task_first_time');
  return {
    points: lines.reduce((sum, line) => sum + line.points, 0),
    tasksJudged: onTime.length,
    onTimeRate: rate(onTime.filter((line) => earned(line.reason)).length, onTime.length),
    firstTimeRate: rate(first.filter((line) => earned(line.reason)).length, first.length),
  };
}

const approvedIn = (month: string) =>
  and(eq(pointsEntries.status, 'approved'), inMonth(pointsEntries.createdAt, month));

/** Every staff member with points or a decision that month, most points first. */
export async function readMonth(db: DatabaseExecutor, month: string): Promise<MonthlyReview> {
  const { start, end } = monthRange(month);
  const [lines, before, ratings, reviews] = await Promise.all([
    db
      .select({
        userId: pointsEntries.userId,
        sourceType: pointsEntries.sourceType,
        points: pointsEntries.points,
        reason: pointsEntries.reason,
      })
      .from(pointsEntries)
      .where(approvedIn(month)),
    db
      .select({
        userId: pointsEntries.userId,
        points: sql<number>`coalesce(sum(${pointsEntries.points}), 0)::int`,
      })
      .from(pointsEntries)
      .where(approvedIn(previousMonth(month)))
      .groupBy(pointsEntries.userId),
    db
      .select({
        userId: stageRatingPeople.userId,
        average: sql<number>`avg(${stageRatingPeople.rating})::float`,
      })
      .from(stageRatingPeople)
      .innerJoin(stageRatings, eq(stageRatings.id, stageRatingPeople.ratingId))
      .where(
        sql`(${stageRatings.createdAt} at time zone 'Asia/Kolkata')::date between ${start}::date and ${end}::date`,
      )
      .groupBy(stageRatingPeople.userId),
    db
      .select({
        userId: monthlyReviews.userId,
        decision: monthlyReviews.decision,
        bonusId: monthlyReviews.bonusId,
        note: monthlyReviews.note,
        amountPaise: projectBonuses.totalPaise,
        status: projectBonuses.status,
      })
      .from(monthlyReviews)
      .leftJoin(projectBonuses, eq(projectBonuses.id, monthlyReviews.bonusId))
      .where(eq(monthlyReviews.month, month)),
  ]);
  const ids = [...new Set([...lines.map((line) => line.userId), ...reviews.map((r) => r.userId)])];
  const people = ids.length
    ? await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const rows: MonthlyRow[] = people.map((user) => {
    const review = reviews.find((entry) => entry.userId === user.id);
    return {
      user,
      ...monthTotals(lines.filter((line) => line.userId === user.id)),
      previousPoints: before.find((entry) => entry.userId === user.id)?.points ?? 0,
      ratingAverage: ratings.find((entry) => entry.userId === user.id)?.average ?? null,
      review: review
        ? {
            decision: review.decision,
            bonusId: review.bonusId,
            amountPaise: review.amountPaise ?? null,
            status: review.status ?? null,
            note: review.note,
          }
        : null,
    };
  });
  rows.sort((a, b) => b.points - a.points || a.user.fullName.localeCompare(b.user.fullName));
  return { month, rows };
}

/** One person's month, every line grouped by the project it came from. */
export async function readPersonMonth(
  db: DatabaseExecutor,
  user: { readonly id: string; readonly fullName: string },
  month: string,
): Promise<MonthlyPerson> {
  const lines = await db
    .select({
      id: pointsEntries.id,
      sourceType: pointsEntries.sourceType,
      sourceId: pointsEntries.sourceId,
      points: pointsEntries.points,
      reason: pointsEntries.reason,
      createdAt: pointsEntries.createdAt,
    })
    .from(pointsEntries)
    .where(and(eq(pointsEntries.userId, user.id), approvedIn(month)))
    .orderBy(asc(pointsEntries.createdAt));
  const taskIds = lines
    .filter((line) => line.sourceType.startsWith('task_'))
    .map((l) => l.sourceId);
  const ratingIds = lines
    .filter((line) => line.sourceType === 'stage_rating')
    .map((l) => l.sourceId);
  const [tasks, rated] = await Promise.all([
    taskIds.length
      ? db
          .select({ id: projectTasks.id, projectId: projectTasks.projectId })
          .from(projectTasks)
          .where(inArray(projectTasks.id, taskIds))
      : [],
    ratingIds.length
      ? db
          .select({ id: stageRatings.id, projectId: stageRatings.projectId })
          .from(stageRatings)
          .where(inArray(stageRatings.id, ratingIds))
      : [],
  ]);
  const projectOf = (line: (typeof lines)[number]): string | null => {
    if (line.sourceType === 'customer_rating') return line.sourceId;
    const link = [...tasks, ...rated].find((entry) => entry.id === line.sourceId);
    return link?.projectId ?? null;
  };
  const projectIds = [...new Set(lines.map(projectOf).filter((id) => id !== null))];
  const named = projectIds.length
    ? await db
        .select({ id: projects.id, code: projects.code, name: projects.name })
        .from(projects)
        .where(inArray(projects.id, projectIds))
    : [];
  const groups = new Map<string | null, MonthlyPerson['projects'][number]>();
  for (const line of lines) {
    const projectId = projectOf(line);
    const project = named.find((entry) => entry.id === projectId);
    const group = groups.get(projectId) ?? {
      projectId,
      code: project?.code ?? '—',
      name: project?.name ?? 'Recognition',
      lines: [],
    };
    group.lines.push({
      id: line.id,
      sourceType: line.sourceType,
      points: line.points,
      reason: line.reason,
      createdAt: line.createdAt.toISOString(),
    });
    groups.set(projectId, group);
  }
  return { month, user, projects: [...groups.values()] };
}
