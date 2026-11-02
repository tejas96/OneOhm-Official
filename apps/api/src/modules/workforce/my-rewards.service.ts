import { Inject, Injectable } from '@nestjs/common';
import type { MyRewards } from '@oneohm/api-contracts';
import {
  pointsEntries,
  projects,
  projectTasks,
  stageRatingPeople,
  stageRatings,
} from '@oneohm/database';
import { achievementsFrom, onTimeStreak } from '@oneohm/domain';
import { monthOf } from '@oneohm/shared';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { bonusesOf } from './bonus-read';
import { earned, monthTotals } from './monthly-review.read';
import { readPoints } from './workforce-read';

/** Finished on or before its due date, in India time. */
const ON_TIME = sql<boolean>`(${projectTasks.completedAt} at time zone 'Asia/Kolkata')::date <= ${projectTasks.dueDate}`;

/**
 * The person's own engagement (PRD 4.7): points history, achievements from verified
 * work, what customers said about them, and their bonuses with how far each is paid.
 */
@Injectable()
export class MyRewardsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(userId: string): Promise<MyRewards> {
    const [points, finished, counts, feedback, bonuses] = await Promise.all([
      readPoints(
        this.db,
        and(eq(pointsEntries.userId, userId), eq(pointsEntries.status, 'approved')),
        500,
      ),
      this.recentFinished(userId),
      this.counts(userId),
      this.feedback(userId),
      bonusesOf(this.db, userId),
    ]);
    // India months everywhere, so a point earned just after midnight IST is in the new month.
    const month = monthOf(new Date());
    const monthLines = points.filter((entry) => monthOf(new Date(entry.createdAt)) === month);
    const total = points.reduce((sum, entry) => sum + entry.points, 0);
    const money = (status: 'approved' | 'paid') =>
      bonuses
        .filter((bonus) => bonus.status === 'approved' && bonus.payableStatus === status)
        .reduce((sum, bonus) => sum + bonus.amountPaise, 0);
    return {
      month: {
        month,
        ...monthTotals(monthLines),
        missed: monthLines
          .filter((entry) => entry.sourceType.startsWith('task_') && !earned(entry.reason))
          .map((entry) => ({ reason: entry.reason, createdAt: entry.createdAt })),
      },
      points: {
        total,
        thisMonth: monthLines.reduce((sum, entry) => sum + entry.points, 0),
        history: points.slice(0, 60),
      },
      achievements: achievementsFrom({
        onTimeStreak: onTimeStreak(finished),
        onTimeTotal: counts.onTime,
        fiveStars: counts.fiveStars,
        recognitions: points.filter((entry) => entry.sourceType === 'recognition').length,
        pointsTotal: total,
      }),
      feedback,
      bonuses,
      approvedPaise: money('approved'),
      paidPaise: money('paid'),
    };
  }

  /** The latest finished tasks, newest first, for the on-time streak. */
  private async recentFinished(userId: string) {
    const rows = await this.db
      .select({ onTime: ON_TIME, waitingParty: projectTasks.waitingParty })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.assigneeUserId, userId),
          eq(projectTasks.status, 'completed'),
          isNotNull(projectTasks.completedAt),
        ),
      )
      .orderBy(desc(projectTasks.completedAt))
      .limit(100);
    return rows.map((row) => ({
      onTime: Boolean(row.onTime),
      lateOnOthers: !row.onTime && row.waitingParty !== 'internal',
    }));
  }

  private async counts(userId: string) {
    const [tasks, stars] = await Promise.all([
      this.db
        .select({ onTime: sql<number>`count(*) filter (where ${ON_TIME})::int` })
        .from(projectTasks)
        .where(
          and(
            eq(projectTasks.assigneeUserId, userId),
            eq(projectTasks.status, 'completed'),
            isNotNull(projectTasks.completedAt),
          ),
        ),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(stageRatingPeople)
        .where(and(eq(stageRatingPeople.userId, userId), eq(stageRatingPeople.rating, 5))),
    ]);
    return { onTime: tasks[0]?.onTime ?? 0, fiveStars: stars[0]?.count ?? 0 };
  }

  /** Stage ratings that name this person: their stars and the customer's words. */
  private async feedback(userId: string): Promise<MyRewards['feedback']> {
    const rows = await this.db
      .select({
        id: stageRatings.id,
        projectCode: projects.code,
        stage: stageRatings.stage,
        stars: stageRatingPeople.rating,
        comment: stageRatings.comment,
        createdAt: stageRatings.createdAt,
      })
      .from(stageRatingPeople)
      .innerJoin(stageRatings, eq(stageRatings.id, stageRatingPeople.ratingId))
      .innerJoin(projects, eq(projects.id, stageRatings.projectId))
      .where(eq(stageRatingPeople.userId, userId))
      .orderBy(desc(stageRatings.createdAt))
      .limit(30);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
}
