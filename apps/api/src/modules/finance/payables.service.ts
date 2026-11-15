import { Inject, Injectable } from '@nestjs/common';
import type { Payable, PayablePayment, PayableReview } from '@oneohm/api-contracts';
import {
  applyVendorAdvances,
  goodsReceipts,
  payables,
  postPayableApproved,
  projects,
  travelClaims,
  users,
} from '@oneohm/database';
import { billTds } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { assertBillWithinLimit } from '../business-settings/approval-limit';
import { type ManualPayment, recordManualPayment } from './payable-manual-payment';
import { listBillPayments, undoBillPayment } from './payable-payment-undo';
import { assertTdsHere } from './payable-tds-guard';
import { presentPayable as present } from './payable-view';
import { assertPanForTds } from './payee-pan-check';

type StatusFilter = 'open' | 'pending' | 'approved' | 'paid' | 'cancelled' | 'all';

export interface NewPayable {
  projectId?: string | null | undefined;
  party: 'vendor' | 'contractor';
  partyName: string;
  description: string;
  billNumber?: string | null | undefined;
  amountPaise: number;
  dueOn: string;
  /** TDS to hold, in basis points; worked out on the whole amount (no GST known). */
  tdsBp?: number | undefined;
}

const claimProject = alias(projects, 'claim_project');

/** A bill with its own project and, for a travel claim, the claim's project (a join). */
const BILL_COLUMNS = {
  payable: payables,
  code: projects.code,
  claimProjectId: travelClaims.projectId,
  claimCode: claimProject.code,
  approver: users.fullName,
};

const projectOf = (row: {
  payable: typeof payables.$inferSelect;
  code: string | null;
  claimProjectId: string | null;
  claimCode: string | null;
}) =>
  row.payable.projectId
    ? { id: row.payable.projectId, code: row.code }
    : { id: row.claimProjectId, code: row.claimCode };

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
      .select(BILL_COLUMNS)
      .from(payables)
      .leftJoin(projects, eq(projects.id, payables.projectId))
      .leftJoin(travelClaims, eq(travelClaims.payableId, payables.id))
      .leftJoin(claimProject, eq(claimProject.id, travelClaims.projectId))
      .leftJoin(users, eq(users.id, payables.approvedByUserId))
      .where(filter)
      .orderBy(
        status === 'paid' ? desc(payables.paidOn) : asc(payables.dueOn),
        asc(payables.createdAt),
      );
    const today = todayIn();
    return rows.map((row) => present(row.payable, projectOf(row), row.approver, today));
  }

  async get(id: string): Promise<Payable> {
    const [row] = await this.db
      .select(BILL_COLUMNS)
      .from(payables)
      .leftJoin(projects, eq(projects.id, payables.projectId))
      .leftJoin(travelClaims, eq(travelClaims.payableId, payables.id))
      .leftJoin(claimProject, eq(claimProject.id, travelClaims.projectId))
      .leftJoin(users, eq(users.id, payables.approvedByUserId))
      .where(eq(payables.id, id))
      .limit(1);
    if (!row) throw notFound('That bill');
    return present(row.payable, projectOf(row), row.approver, todayIn());
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
          tdsBp: input.tdsBp ?? 0,
          tdsPaise: billTds({
            amountPaise: input.amountPaise,
            gstPaise: 0,
            tdsBp: input.tdsBp ?? 0,
          }),
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

  /**
   * Before approval, finance enters the vendor's invoice total (checked against the
   * order) and the TDS rate. TDS is fixed once the bill is approved and booked.
   */
  async review(actor: Actor, id: string, input: PayableReview): Promise<Payable> {
    await this.db.transaction(async (tx) => {
      const [bill] = await tx.select().from(payables).where(eq(payables.id, id)).for('update');
      if (!bill) throw notFound('That bill');
      if (bill.status !== 'pending') {
        throw conflict('Invoice and TDS can be changed only before the bill is approved.');
      }
      if (input.tdsBp > 0) await assertTdsHere(tx, bill);
      await assertPanForTds(tx, id, input.tdsBp);
      const tdsPaise = billTds({
        amountPaise: bill.amountPaise,
        gstPaise: bill.gstPaise,
        tdsBp: input.tdsBp,
      });
      await tx
        .update(payables)
        .set({
          vendorInvoicePaise: input.vendorInvoicePaise,
          tdsBp: input.tdsBp,
          tdsPaise,
          updatedAt: new Date(),
        })
        .where(eq(payables.id, id));
      await recordAudit(tx, actor.userId, 'payable.reviewed', 'payable', id, {
        vendorInvoicePaise: input.vendorInvoicePaise,
        tdsBp: input.tdsBp,
        tdsPaise,
      });
    });
    return this.get(id);
  }

  async approve(actor: Actor, id: string): Promise<Payable> {
    await assertBillWithinLimit(this.db, actor, id);
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

  /** Records a payment made outside OneOhm: all that is left, or a part of it. */
  async pay(actor: Actor, id: string, input: ManualPayment): Promise<Payable> {
    await this.db.transaction((tx) => recordManualPayment(tx, actor, id, input));
    return this.get(id);
  }

  /** The payments made on a bill, with whether the caller may undo each. */
  payments(actor: Actor, id: string): Promise<PayablePayment[]> {
    return listBillPayments(this.db, actor, id);
  }

  /** Undoes a payment recorded by hand (see `undoBillPayment`). */
  async undoPayment(actor: Actor, id: string, paymentId: string, reason: string): Promise<Payable> {
    await this.db.transaction((tx) => undoBillPayment(tx, actor, id, paymentId, reason));
    return this.get(id);
  }

  private async notPending(id: string, action: 'approved' | 'paid') {
    const [row] = await this.db
      .select({ status: payables.status, amount: payables.amountPaise })
      .from(payables)
      .where(eq(payables.id, id))
      .limit(1);
    if (!row) return notFound('That bill');
    if (row.status === 'cancelled') return conflict('This bill was cancelled.', 'cancelled');
    if (action === 'paid' && row.status === 'pending') {
      return conflict(`This ${formatInr(row.amount)} bill needs approval before it is paid.`);
    }
    return conflict(`This bill is already ${row.status}.`);
  }
}
