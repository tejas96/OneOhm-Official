import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PointsEntry, PointsStanding } from '@oneohm/api-contracts';
import { notify, pointsEntries, users } from '@oneohm/database';
import { monthOf } from '@oneohm/shared';
import { and, eq, ne, type SQL, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { STAFF_NOTICES } from '../../common/notices';
import { DATABASE, type Database } from '../../config/core.module';
import { inMonth } from './monthly-review.read';
import { loadPolicy } from './policy';
import { readPoints } from './workforce-read';

/** Approved points per person, all-time and this month, highest first (PRD 4.7). */
@Injectable()
export class PointsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(where?: SQL): Promise<PointsEntry[]> {
    return readPoints(this.db, where);
  }

  async standings(): Promise<PointsStanding[]> {
    const thisMonth = inMonth(pointsEntries.createdAt, monthOf(new Date()));
    const rows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        total: sql<number>`coalesce(sum(${pointsEntries.points}), 0)::int`,
        thisMonth: sql<number>`coalesce(sum(${pointsEntries.points}) filter (where ${thisMonth}), 0)::int`,
      })
      .from(pointsEntries)
      .innerJoin(users, eq(users.id, pointsEntries.userId))
      // People who have left drop off the live board; their rows stay in history.
      .where(and(eq(pointsEntries.status, 'approved'), eq(users.status, 'active')))
      .groupBy(users.id, users.fullName)
      .orderBy(sql`3 desc`, users.fullName);
    return rows.map(({ id, fullName, total, thisMonth }) => ({
      user: { id, fullName },
      total,
      thisMonth,
    }));
  }

  /** Recognition from a manager, up to the policy's limit; given straight away. */
  async give(
    actor: Actor,
    input: { userId: string; points: number; reason: string },
  ): Promise<PointsEntry> {
    const { points } = await loadPolicy(this.db);
    if (input.points > points.recognitionMax)
      throw invalid(`Give up to ${points.recognitionMax} points at a time.`, {
        points: 'Too many.',
      });
    if (input.userId === actor.userId)
      throw conflict('Someone else recognises your own work.', 'own');
    const [row] = await this.db
      .insert(pointsEntries)
      .values({
        userId: input.userId,
        points: input.points,
        reason: input.reason,
        sourceType: 'recognition',
        sourceId: randomUUID(),
        status: 'approved',
        createdByUserId: actor.userId,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
      })
      .returning({ id: pointsEntries.id });
    await recordAudit(this.db, actor.userId, 'points.given', 'points_entry', row?.id ?? '', input);
    return this.one(row?.id ?? '');
  }

  /** A suggestion (for example from a customer rating) approved or turned down. */
  async decide(actor: Actor, id: string, approve: boolean): Promise<PointsEntry> {
    const [row] = await this.db
      .update(pointsEntries)
      .set({
        status: approve ? 'approved' : 'rejected',
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(pointsEntries.id, id),
          eq(pointsEntries.status, 'pending'),
          ne(pointsEntries.userId, actor.userId),
        ),
      )
      .returning({
        userId: pointsEntries.userId,
        points: pointsEntries.points,
        reason: pointsEntries.reason,
      });
    if (!row) throw conflict('This suggestion was already decided, or it is for you.', 'decided');
    if (approve)
      await notify(
        this.db,
        { userId: row.userId },
        STAFF_NOTICES.pointsApproved(id, row.points, row.reason),
      );
    await recordAudit(
      this.db,
      actor.userId,
      `points.${approve ? 'approved' : 'rejected'}`,
      'points_entry',
      id,
    );
    return this.one(id);
  }

  private async one(id: string): Promise<PointsEntry> {
    const [entry] = await this.list(eq(pointsEntries.id, id));
    if (!entry) throw notFound('That entry');
    return entry;
  }
}
