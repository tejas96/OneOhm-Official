import { Inject, Injectable } from '@nestjs/common';
import type { LeaveImpact, LeaveRequestRecord } from '@oneohm/api-contracts';
import {
  leaveRequests,
  notify,
  notifyHolders,
  roles,
  type Transaction,
  userRoles,
  users,
} from '@oneohm/database';
import { checkHandover } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { STAFF_NOTICES } from '../../common/notices';
import { DATABASE, type Database } from '../../config/core.module';
import { assertMayDecide } from './leave-approver';
import { clashesFor, NO_CLASHES } from './leave-clash-read';
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
 * emergency may go over and HR settles it); approving hands the open tasks in the
 * window to the named backup, so projects keep moving.
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
      throw invalid('These days are all weekly offs.', { fromDate: 'No working days.' });
    if (impact.overlapsExisting)
      throw conflict('You already have leave on some of these days.', 'overlap');
    if (impact.balanceAfterHalfDays < 0 && !input.emergency)
      throw invalid('Not enough leave left of this kind.', { leaveType: 'Over the balance.' });
    if (input.backupUserId === actor.userId)
      throw invalid('Pick someone else to cover.', { backupUserId: 'Not yourself.' });
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
      })
      .returning({ id: leaveRequests.id });
    if (row)
      await notifyHolders(
        this.db,
        'leave.approve',
        STAFF_NOTICES.leaveRequested(row.id, actor.fullName, input.fromDate, input.toDate),
        actor.userId,
      );
    return this.one(row?.id ?? '');
  }

  async cancel(actor: Actor, id: string): Promise<LeaveRequestRecord> {
    const [row] = await this.db
      .update(leaveRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(leaveRequests.id, id),
          eq(leaveRequests.userId, actor.userId),
          inArray(leaveRequests.status, ['pending', 'approved']),
        ),
      )
      .returning({ id: leaveRequests.id });
    if (!row) throw conflict('This leave can no longer be cancelled.', 'closed');
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
      const outcome = decision.approve
        ? await this.approve(tx, actor, row, decision)
        : { handed: 0, skipped: false, backupId: row.backupUserId };
      await notify(
        tx,
        { userId: row.userId },
        STAFF_NOTICES.leaveDecided(id, decision.approve, row.fromDate, row.toDate),
      );
      await tx
        .update(leaveRequests)
        .set({
          status: decision.approve ? 'approved' : 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: decision.note ?? null,
          backupUserId: outcome.backupId,
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
    const backupId = decision.backupUserId === undefined ? row.backupUserId : decision.backupUserId;
    const work = await affectedWork(tx, row.userId, row);
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
    if (backupId) await this.assertActiveStaff(tx, backupId);
    const handed = backupId ? await handOverWork(tx, actor.userId, row, backupId, work) : 0;
    await tellProjectManagers(tx, row, work, backupId);
    return { handed, skipped: check.skipped, backupId };
  }

  private async assertActiveStaff(tx: Transaction, userId: string) {
    const [person] = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .limit(1);
    if (!person) throw invalid('Pick an active team member.', { backupUserId: 'Not available.' });
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
