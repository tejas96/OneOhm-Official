import { Inject, Injectable } from '@nestjs/common';
import type { Payable } from '@oneohm/api-contracts';
import {
  applyVendorAdvances,
  goodsReceipts,
  payables,
  postPayableApproved,
  postPayablePaid,
  projects,
  users,
} from '@oneohm/database';
import type { MoneyOutMethod } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

type Row = typeof payables.$inferSelect;
type StatusFilter = 'open' | 'pending' | 'approved' | 'paid' | 'all';

export interface NewPayable {
  projectId?: string | null | undefined;
  party: 'vendor' | 'contractor';
  partyName: string;
  description: string;
  billNumber?: string | null | undefined;
  amountPaise: number;
  dueOn: string;
}

/**
 * Bills owed to vendors and contractor crews (PRD 3.11, 3.13). A bill is approved before
 * it is paid; approval books the cost, payment reduces the bank or cash it came from.
 */
@Injectable()
export class PayablesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(status: StatusFilter): Promise<Payable[]> {
    const filter: SQL | undefined =
      status === 'all'
        ? undefined
        : status === 'open'
          ? inArray(payables.status, ['pending', 'approved'])
          : eq(payables.status, status);
    const rows = await this.db
      .select({ payable: payables, code: projects.code, approver: users.fullName })
      .from(payables)
      .leftJoin(projects, eq(projects.id, payables.projectId))
      .leftJoin(users, eq(users.id, payables.approvedByUserId))
      .where(filter)
      .orderBy(
        status === 'paid' ? desc(payables.paidOn) : asc(payables.dueOn),
        asc(payables.createdAt),
      );
    const today = todayIn();
    return rows.map((row) => present(row.payable, row.code, row.approver, today));
  }

  async get(id: string): Promise<Payable> {
    const [row] = await this.db
      .select({ payable: payables, code: projects.code, approver: users.fullName })
      .from(payables)
      .leftJoin(projects, eq(projects.id, payables.projectId))
      .leftJoin(users, eq(users.id, payables.approvedByUserId))
      .where(eq(payables.id, id))
      .limit(1);
    if (!row) throw notFound('That bill');
    return present(row.payable, row.code, row.approver, todayIn());
  }

  async create(actor: Actor, input: NewPayable): Promise<Payable> {
    if (input.projectId) {
      const [project] = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project) throw invalid('Pick a project from the list.', { projectId: 'Not found.' });
    }
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(payables)
        .values({
          projectId: input.projectId ?? null,
          party: input.party,
          partyName: input.partyName,
          description: input.description,
          billNumber: input.billNumber ?? null,
          amountPaise: input.amountPaise,
          dueOn: input.dueOn,
        })
        .returning({ id: payables.id });
      if (!row) throw new Error('Payable insert returned nothing.');
      await recordAudit(tx, actor.userId, 'payable.created', 'payable', row.id, {
        amountPaise: input.amountPaise,
        party: input.party,
      });
      return row.id;
    });
    return this.get(id);
  }

  async approve(actor: Actor, id: string): Promise<Payable> {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(payables)
        .set({
          status: 'approved',
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(payables.id, id), eq(payables.status, 'pending')))
        .returning({ amount: payables.amountPaise });
      if (!updated) throw await this.notPending(id, 'approved');
      await postPayableApproved(tx, id, actor.userId);
      // A vendor bill from a goods receipt: advances paid on that order come off it.
      const [receipt] = await tx
        .select({ orderId: goodsReceipts.purchaseOrderId })
        .from(goodsReceipts)
        .where(eq(goodsReceipts.payableId, id))
        .limit(1);
      if (receipt) await applyVendorAdvances(tx, receipt.orderId, actor.userId);
      await recordAudit(tx, actor.userId, 'payable.approved', 'payable', id, {
        amountPaise: updated.amount,
      });
    });
    return this.get(id);
  }

  async pay(
    actor: Actor,
    id: string,
    input: { method: MoneyOutMethod; paidOn: string; reference?: string | null | undefined },
  ): Promise<Payable> {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(payables)
        .set({
          status: 'paid',
          paidAt: new Date(),
          paidOn: input.paidOn,
          paidMethod: input.method,
          paidReference: input.reference ?? null,
          paidByUserId: actor.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(payables.id, id), eq(payables.status, 'approved')))
        .returning({ amount: payables.amountPaise });
      if (!updated) throw await this.notPending(id, 'paid');
      await postPayablePaid(tx, id, actor.userId);
      await recordAudit(tx, actor.userId, 'payable.paid', 'payable', id, {
        amountPaise: updated.amount,
        method: input.method,
      });
    });
    return this.get(id);
  }

  private async notPending(id: string, action: 'approved' | 'paid') {
    const [row] = await this.db
      .select({ status: payables.status, amount: payables.amountPaise })
      .from(payables)
      .where(eq(payables.id, id))
      .limit(1);
    if (!row) return notFound('That bill');
    if (action === 'paid' && row.status === 'pending') {
      return conflict(`This ${formatInr(row.amount)} bill needs approval before it is paid.`);
    }
    return conflict(`This bill is already ${row.status}.`);
  }
}

function present(row: Row, code: string | null, approver: string | null, today: string): Payable {
  return {
    id: row.id,
    projectId: row.projectId,
    projectCode: code,
    party: row.party,
    partyName: row.partyName,
    description: row.description,
    billNumber: row.billNumber,
    amountPaise: row.amountPaise,
    dueOn: row.dueOn,
    status: row.status,
    overdue: row.status !== 'paid' && row.dueOn < today,
    approvedBy:
      row.approvedByUserId && approver ? { id: row.approvedByUserId, fullName: approver } : null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    paidOn: row.paidOn,
    paidMethod: row.paidMethod,
    paidReference: row.paidReference,
    createdAt: row.createdAt.toISOString(),
    advanceAdjustedPaise: row.advanceAdjustedPaise,
  };
}
