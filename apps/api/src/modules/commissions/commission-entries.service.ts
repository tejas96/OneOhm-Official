import { Inject, Injectable } from '@nestjs/common';
import type { CommissionEntry, IncentiveFilter, PayoutInput } from '@oneohm/api-contracts';
import {
  commissionEntries,
  customers,
  postIncentiveApproved,
  postIncentivePaid,
  projects,
  users,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { outMethod, statusCondition } from '../referrals/incentive-shared';
import { evaluateCommissions } from './commission-evaluation';
import { announceCommission } from './commission-messages';

type Status = CommissionEntry['status'];
const approvers = alias(users, 'approvers');

export interface EntryQuery {
  readonly status: IncentiveFilter;
  readonly resellerId?: string | undefined;
  readonly id?: string | undefined;
}

/** Commission entries for finance: approve (books the cost), pay, or turn down. */
@Injectable()
export class CommissionEntriesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(query: EntryQuery): Promise<CommissionEntry[]> {
    if (!query.id) await evaluateCommissions(this.db);
    const rows = await this.db
      .select({
        entry: commissionEntries,
        reseller: users.fullName,
        approver: approvers.fullName,
        projectCode: projects.code,
        customerName: customers.name,
      })
      .from(commissionEntries)
      .innerJoin(users, eq(users.id, commissionEntries.resellerUserId))
      .leftJoin(approvers, eq(approvers.id, commissionEntries.approvedByUserId))
      .innerJoin(projects, eq(projects.id, commissionEntries.projectId))
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(
        and(
          statusCondition(commissionEntries.status, query.status),
          query.resellerId ? eq(commissionEntries.resellerUserId, query.resellerId) : undefined,
          query.id ? eq(commissionEntries.id, query.id) : undefined,
        ),
      )
      .orderBy(desc(commissionEntries.earnedAt));
    return rows.map(({ entry, reseller, approver, projectCode, customerName }) => ({
      id: entry.id,
      status: entry.status,
      amountPaise: entry.amountPaise,
      qualifyingEvent: entry.qualifyingEvent,
      earnedAt: entry.earnedAt.toISOString(),
      approvedAt: entry.approvedAt?.toISOString() ?? null,
      approvedBy:
        entry.approvedByUserId && approver
          ? { id: entry.approvedByUserId, fullName: approver }
          : null,
      rejectReason: entry.rejectReason,
      paidOn: entry.paidOn,
      paidMethod: outMethod(entry.paidMethod),
      paidReference: entry.paidReference,
      reseller: { id: entry.resellerUserId, fullName: reseller },
      projectId: entry.projectId,
      projectCode,
      customerName,
      capacityWp: entry.capacityWp,
      projectValuePaise: entry.projectValuePaise,
      basis: entry.basis,
      rateBp: entry.rateBp,
      perKwPaise: entry.perKwPaise,
    }));
  }

  async get(id: string): Promise<CommissionEntry> {
    const [entry] = await this.list({ status: 'all', id });
    if (!entry) throw notFound('That commission');
    return entry;
  }

  async approve(actor: Actor, id: string): Promise<CommissionEntry> {
    await this.step(actor, id, 'pending', {
      status: 'approved',
      approvedAt: new Date(),
      approvedByUserId: actor.userId,
    });
    return this.get(id);
  }

  async reject(actor: Actor, id: string, reason: string): Promise<CommissionEntry> {
    await this.step(actor, id, 'pending', {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedByUserId: actor.userId,
      rejectReason: reason,
    });
    return this.get(id);
  }

  async pay(actor: Actor, id: string, input: PayoutInput): Promise<CommissionEntry> {
    await this.step(actor, id, 'approved', {
      status: 'paid',
      paidAt: new Date(),
      paidOn: input.paidOn,
      paidMethod: input.method,
      paidReference: input.reference ?? null,
      paidByUserId: actor.userId,
    });
    return this.get(id);
  }

  /** Moves an entry on from `from`, books the ledger, audits and tells the reseller. */
  private async step(
    actor: Actor,
    id: string,
    from: Status,
    change: Partial<typeof commissionEntries.$inferInsert> & { status: Status },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(commissionEntries)
        .set({ ...change, updatedAt: new Date() })
        .where(and(eq(commissionEntries.id, id), eq(commissionEntries.status, from)))
        .returning({ amountPaise: commissionEntries.amountPaise });
      if (!updated) throw await this.notReady(id, from);
      if (change.status === 'approved') {
        await postIncentiveApproved(tx, 'commission', id, actor.userId);
      }
      if (change.status === 'paid') await postIncentivePaid(tx, 'commission', id, actor.userId);
      await recordAudit(tx, actor.userId, `commission.${change.status}`, 'commission', id, {
        amountPaise: updated.amountPaise,
        ...(change.paidMethod ? { method: change.paidMethod } : {}),
        ...(change.rejectReason ? { reason: change.rejectReason } : {}),
      });
      await announceCommission(tx, id, actor.userId);
    });
  }

  private async notReady(id: string, from: Status) {
    const [row] = await this.db
      .select({ status: commissionEntries.status, amountPaise: commissionEntries.amountPaise })
      .from(commissionEntries)
      .where(eq(commissionEntries.id, id))
      .limit(1);
    if (!row) return notFound('That commission');
    if (from === 'approved' && row.status === 'pending') {
      return conflict(
        `This ${formatInr(row.amountPaise)} commission needs approval before it is paid.`,
      );
    }
    return conflict(`This commission is already ${row.status}.`);
  }
}
