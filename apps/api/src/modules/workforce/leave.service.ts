import { Inject, Injectable } from '@nestjs/common';
import type { LeaveImpact, LeaveRequestRecord } from '@oneohm/api-contracts';
import { leaveRequests, notify, notifyHolders, type Transaction } from '@oneohm/database';
import { checkHandover } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { STAFF_NOTICES } from '../../common/notices';
import { DATABASE, type Database } from '../../config/core.module';
import { assertMayDecide } from './leave-approver';
import { clashesFor, NO_CLASHES } from './leave-clash-read';
import {
  askCover,
  assertActiveStaff,
  assertNotAway,
  COVER_NOTICES,
  coverProblem,
  dropCover,
  nameOf,
  tellCoverAnswer,
} from './leave-cover';
import { handOverWork, tellProjectManagers } from './leave-handover';
import { affectedCount, affectedWork, type LeaveWindow, leaveImpact } from './leave-impact';
import { loadPolicy } from './policy';
import { readLeave } from './workforce-read';

export interface LeaveApplication extends LeaveWindow {
  reason?: string | null | undefined;
  emergency: boolean;
  backupUserId?: string | null | undefined;
  handoverNote?: string | null | undefined;
}

export interface LeaveDecision {
  readonly approve: boolean;
  readonly note?: string | null | undefined;
  readonly backupUserId?: string | null | undefined;
  readonly skipHandover?: boolean | undefined;
}

/**
 * Leave with its handover (PRD 3.12, 4.6, Flow E). Applying checks the balance (an
 * emergency may go over and HR settles it) and asks the named backup; approving hands
 * the open tasks in the window to a backup who said yes, so projects keep moving.
 */
@Injectable()
export class LeaveService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(where?: SQL): Promise<LeaveRequestRecord[]> {
    const policy = await loadPolicy(this.db);
    const items = await readLeave(this.db, policy, where);
    // Pending requests carry their clashes, for the approver and the person asking.
    const pending = items.filter((item) => item.row.status === 'pending').map((item) => item.row);
    const clashes = await clashesFor(this.db, pending);
    return items.map((item) => ({
      ...item.record,
      clashes: clashes.get(item.row.id) ?? NO_CLASHES,
    }));
  }

  async impact(actor: Actor, window: LeaveWindow): Promise<LeaveImpact> {
    const policy = await loadPolicy(this.db);
    this.assertKnownType(policy.leaveTypes, window.leaveType);
    return leaveImpact(this.db, policy, actor.userId, window);
  }

  async apply(actor: Actor, input: LeaveApplication): Promise<LeaveRequestRecord> {
    const policy = await loadPolicy(this.db);
    this.assertKnownType(policy.leaveTypes, input.leaveType);
    if (input.halfDay && input.fromDate !== input.toDate)
      throw invalid('A half day is a single day.', { halfDay: 'Pick one day.' });
    if (!input.emergency && input.fromDate < todayIn())
      throw invalid('Leave starts today or later; use emergency leave for days already gone.', {
        fromDate: 'In the past.',
      });
    const impact = await leaveImpact(this.db, policy, actor.userId, input);
    if (impact.halfDays === 0)
      throw invalid('These days are all weekly offs or holidays.', {
        fromDate: 'No working days.',
      });
    if (impact.overlapsExisting)
      throw conflict('You already have leave on some of these days.', 'overlap');
    if (impact.balanceAfterHalfDays < 0 && !input.emergency)
      throw invalid('Not enough leave left of this kind.', { leaveType: 'Over the balance.' });
    if (input.backupUserId === actor.userId)
      throw invalid('Pick someone else to cover.', { backupUserId: 'Not yourself.' });
    if (input.backupUserId) await assertActiveStaff(this.db, input.backupUserId);
    const [row] = await this.db
      .insert(leaveRequests)
      .values({
        userId: actor.userId,
        leaveType: input.leaveType,
        fromDate: input.fromDate,
        toDate: input.toDate,
        halfDay: input.halfDay,
        halfDays: impact.halfDays,
        reason: input.reason ?? null,
        emergency: input.emergency,
        backupUserId: input.backupUserId ?? null,
        handoverNote: input.handoverNote ?? null,
        coverAnswer: input.backupUserId ? 'asked' : null,
      })
      .returning();
    if (row) await askCover(this.db, row);
    if (row)
      await notifyHolders(
        this.db,
        'leave.approve',
        STAFF_NOTICES.leaveRequested(row.id, actor.fullName, input.fromDate, input.toDate),
        actor.userId,
      );
    return this.one(row?.id ?? '');
  }

  /**
   * The applicant takes leave back. Whoever was asked to cover hears it; after approval the
   * backup and the approver hear that the handed work stays with the backup for now.
   */
  async cancel(actor: Actor, id: string): Promise<LeaveRequestRecord> {
    await this.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(leaveRequests)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, actor.userId)))
        .for('update')
        .limit(1);
      if (!before || (before.status !== 'pending' && before.status !== 'approved'))
        throw conflict('This leave can no longer be cancelled.', 'closed');
      await tx
        .update(leaveRequests)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(leaveRequests.id, id));
      if (before.status === 'pending') {
        await dropCover(tx, before, 'the leave was cancelled.');
        return;
      }
      const handed = before.backupUserId !== null && before.tasksHandedOver > 0;
      if (handed && before.backupUserId)
        await notify(
          tx,
          { userId: before.backupUserId },
          COVER_NOTICES.cancelledAfterHandover(before, actor.fullName),
        );
      else await dropCover(tx, before, 'the leave was cancelled.');
      if (before.decidedByUserId && before.decidedByUserId !== actor.userId)
        await notify(
          tx,
          { userId: before.decidedByUserId },
          COVER_NOTICES.approvedLeaveCancelled(
            before,
            actor.fullName,
            handed ? before.tasksHandedOver : 0,
          ),
        );
    });
    return this.one(id);
  }

  /** Leave the signed-in person is asked to cover, or covers, newest first. */
  async covering(actor: Actor): Promise<LeaveRequestRecord[]> {
    const items = await this.list(eq(leaveRequests.backupUserId, actor.userId));
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * The named backup says yes or no, once, while the leave is pending. No needs a note; yes
   * is refused when they are away themselves then. Applicant and approvers hear the answer.
   */
  async answerCover(
    actor: Actor,
    id: string,
    answer: { accept: boolean; note?: string | null | undefined },
  ): Promise<LeaveRequestRecord> {
    const note = answer.note?.trim() || null;
    if (!answer.accept && !note)
      throw invalid('Say why you cannot cover.', { note: 'Needed to decline.' });
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, id))
        .for('update')
        .limit(1);
      if (!row || row.backupUserId !== actor.userId) throw notFound('A cover request for you');
      if (row.status !== 'pending')
        throw conflict('This leave has already been decided or cancelled.', 'decided');
      if (row.coverAnswer !== 'asked')
        throw conflict('You have already answered this request.', 'answered');
      if (answer.accept)
        await assertNotAway(tx, actor.userId, row, 'You are on leave on some of these days.');
      const [answered] = await tx
        .update(leaveRequests)
        .set({
          coverAnswer: answer.accept ? 'accepted' : 'declined',
          coverNote: note,
          coverAnsweredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leaveRequests.id, id))
        .returning();
      if (answered) await tellCoverAnswer(tx, answered, answer.accept);
      await recordAudit(
        tx,
        actor.userId,
        `leave.cover_${answer.accept ? 'accepted' : 'declined'}`,
        'leave_request',
        id,
        { note },
      );
    });
    return this.one(id);
  }

  /**
   * The applicant or an approver asks someone else to cover, or nobody, while pending. The
   * person dropped hears it; the new one is asked.
   */
  async changeBackup(
    actor: Actor,
    id: string,
    backupUserId: string | null,
    mayApprove: boolean,
  ): Promise<LeaveRequestRecord> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, id))
        .for('update')
        .limit(1);
      if (!row || (row.userId !== actor.userId && !mayApprove))
        throw notFound('That leave request');
      if (row.status !== 'pending')
        throw conflict('This leave has already been decided or cancelled.', 'decided');
      if (backupUserId === row.userId)
        throw invalid('Pick someone else to cover.', { backupUserId: 'Not the person on leave.' });
      if (backupUserId === row.backupUserId && row.coverAnswer !== 'declined') return;
      if (backupUserId) {
        await assertActiveStaff(tx, backupUserId);
        await assertNotAway(tx, backupUserId, row, 'They are on leave on some of these days.');
      }
      if (row.backupUserId !== backupUserId)
        await dropCover(tx, row, 'someone else was asked to cover.');
      const [changed] = await tx
        .update(leaveRequests)
        .set({
          backupUserId,
          coverAnswer: backupUserId ? 'asked' : null,
          coverNote: null,
          coverAnsweredAt: null,
          updatedAt: new Date(),
        })
        .where(eq(leaveRequests.id, id))
        .returning();
      if (changed) await askCover(tx, changed);
      await recordAudit(tx, actor.userId, 'leave.backup_changed', 'leave_request', id, {
        from: row.backupUserId,
        to: backupUserId,
      });
    });
    return this.one(id);
  }

  /** For the approver: the work a request touches now, and who could cover it. */
  async requestImpact(id: string): Promise<LeaveImpact> {
    const [row] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
    if (!row) throw notFound('That leave request');
    const policy = await loadPolicy(this.db);
    return leaveImpact(this.db, policy, row.userId, row, row.id, row.backupUserId);
  }

  /**
   * Approving hands the affected work to the backup (the one asked for, or the approver's
   * pick) and tells the projects' managers. Ordinary leave with affected work needs a
   * backup; emergency leave may go ahead without one, flagged (PRD 4.6, Flow E).
   */
  async decide(actor: Actor, id: string, decision: LeaveDecision): Promise<LeaveRequestRecord> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, id))
        .for('update')
        .limit(1);
      if (!row) throw notFound('That leave request');
      if (row.status !== 'pending')
        throw conflict('This request has already been decided.', 'decided');
      await assertMayDecide(tx, actor.userId, row);
      if (!decision.approve && !decision.note?.trim())
        throw invalid('Say why the leave is not approved.', { note: 'Needed to decline.' });
      const outcome = decision.approve
        ? await this.approve(tx, actor, row, decision)
        : { handed: 0, skipped: false, backupId: row.backupUserId };
      if (!decision.approve) await dropCover(tx, row, 'the leave was not approved.');
      await notify(
        tx,
        { userId: row.userId },
        STAFF_NOTICES.leaveDecided(id, decision.approve, row.fromDate, row.toDate, decision.note),
      );
      await tx
        .update(leaveRequests)
        .set({
          status: decision.approve ? 'approved' : 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: decision.note ?? null,
          backupUserId: outcome.backupId,
          ...(outcome.backupId
            ? {}
            : { coverAnswer: null, coverNote: null, coverAnsweredAt: null }),
          tasksHandedOver: outcome.handed,
          handoverSkipped: outcome.skipped,
          updatedAt: new Date(),
        })
        .where(eq(leaveRequests.id, id));
      await recordAudit(
        tx,
        actor.userId,
        `leave.${decision.approve ? 'approved' : 'rejected'}`,
        'leave_request',
        id,
        {
          tasksHandedOver: outcome.handed,
          backupUserId: outcome.backupId,
          handoverSkipped: outcome.skipped,
        },
      );
    });
    return this.one(id);
  }

  private async approve(
    tx: Transaction,
    actor: Actor,
    row: typeof leaveRequests.$inferSelect,
    decision: LeaveDecision,
  ) {
    const named = decision.backupUserId === undefined ? row.backupUserId : decision.backupUserId;
    // Nobody gets the work by force: someone new is asked first, and must say yes.
    if (named && named !== row.backupUserId)
      throw invalid('Ask them to cover first; they need to accept.', {
        backupUserId: 'Not asked yet.',
      });
    const work = await affectedWork(tx, row.userId, row);
    // Nothing to cover: a backup who has not said yes is let go, not left waiting.
    const backupId =
      named && affectedCount(work) === 0 && row.coverAnswer !== 'accepted' ? null : named;
    const check = checkHandover({
      affected: affectedCount(work),
      backupUserId: backupId,
      leaveUserId: row.userId,
      emergency: row.emergency,
      skip: decision.skipHandover ?? false,
    });
    if (check.problem === 'backup_is_self')
      throw invalid('Pick someone else to cover.', { backupUserId: 'Not the person on leave.' });
    if (check.problem === 'backup_needed')
      throw invalid(
        row.emergency
          ? 'Pick who covers the work, or approve without a handover.'
          : 'This leave touches open work. Pick who covers it.',
        { backupUserId: 'Pick a backup.' },
      );
    if (backupId) {
      const problem = coverProblem(row, await nameOf(tx, backupId));
      if (problem) throw invalid(problem, { backupUserId: 'Not accepted.' });
      await assertActiveStaff(tx, backupId);
      await assertNotAway(tx, backupId, row, 'The backup is on leave on some of these days.');
    } else if (row.backupUserId) {
      await dropCover(
        tx,
        row,
        affectedCount(work) === 0
          ? 'the leave touches no open work.'
          : 'the leave was approved with nobody covering.',
      );
    }
    const handed = backupId ? await handOverWork(tx, actor.userId, row, backupId, work) : 0;
    await tellProjectManagers(tx, row, work, backupId);
    return { handed, skipped: check.skipped, backupId };
  }

  private async one(id: string): Promise<LeaveRequestRecord> {
    const [record] = await this.list(eq(leaveRequests.id, id));
    if (!record) throw notFound('That leave request');
    return record;
  }

  private assertKnownType(types: readonly { key: string }[], key: string) {
    if (!types.some((type) => type.key === key))
      throw invalid('Pick a kind of leave from the list.', { leaveType: 'Unknown.' });
  }
}
