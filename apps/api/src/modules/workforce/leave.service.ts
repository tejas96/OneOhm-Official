import { Inject, Injectable } from '@nestjs/common';
import type { LeaveImpact, LeaveRequestRecord } from '@oneohm/api-contracts';
import {
  leaveRequests,
  projectActivities,
  projectTasks,
  type Transaction,
  users,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { type LeaveWindow, leaveImpact, tasksInWindow } from './leave-impact';
import { loadPolicy } from './policy';
import { readLeave } from './workforce-read';

export interface LeaveApplication extends LeaveWindow {
  reason?: string | null | undefined;
  emergency: boolean;
  backupUserId?: string | null | undefined;
  handoverNote?: string | null | undefined;
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
    return (await readLeave(this.db, policy, where)).map((item) => item.record);
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

  async decide(
    actor: Actor,
    id: string,
    approve: boolean,
    note?: string | null,
  ): Promise<LeaveRequestRecord> {
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
      if (row.userId === actor.userId)
        throw conflict('Someone else approves your own leave.', 'own');
      const handed = approve ? await handOver(tx, actor.userId, row) : 0;
      await tx
        .update(leaveRequests)
        .set({
          status: approve ? 'approved' : 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: note ?? null,
          tasksHandedOver: handed,
          updatedAt: new Date(),
        })
        .where(eq(leaveRequests.id, id));
      await recordAudit(
        tx,
        actor.userId,
        `leave.${approve ? 'approved' : 'rejected'}`,
        'leave_request',
        id,
        {
          tasksHandedOver: handed,
        },
      );
    });
    return this.one(id);
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

/** On approval, the open tasks in the leave window go to the named backup, with a note on each project. */
async function handOver(
  tx: Transaction,
  approverId: string,
  row: typeof leaveRequests.$inferSelect,
): Promise<number> {
  const backupId = row.backupUserId;
  if (!backupId) return 0;
  const tasks = await tasksInWindow(tx, row.userId, row);
  if (tasks.length === 0) return 0;
  await tx
    .update(projectTasks)
    .set({ assigneeUserId: backupId, updatedAt: new Date() })
    .where(
      inArray(
        projectTasks.id,
        tasks.map((task) => task.id),
      ),
    );
  const [backup] = await tx
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, backupId));
  for (const task of tasks) {
    await tx.insert(projectActivities).values({
      projectId: task.projectId,
      kind: 'task_handover',
      message: `${task.title} handed to ${backup?.fullName ?? 'a backup'} during leave.`,
      userId: approverId,
    });
  }
  return tasks.length;
}
