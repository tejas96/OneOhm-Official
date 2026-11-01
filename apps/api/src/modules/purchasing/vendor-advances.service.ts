import { Inject, Injectable } from '@nestjs/common';
import type { VendorAdvance } from '@oneohm/api-contracts';
import {
  applyVendorAdvances,
  postVendorAdvancePaid,
  purchaseOrders,
  type Transaction,
  vendorAdvances,
  vendors,
} from '@oneohm/database';
import {
  advanceRoom,
  canStepAdvance,
  type MoneyOutMethod,
  type VendorAdvanceStatus,
  type VendorAdvanceStep,
} from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq, gt, inArray, ne, or, type SQL, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { nextNumber } from '../inventory/stock-ledger';
import { tellApprovers } from './purchasing-notices';
import { vendorAdvanceRow, vendorAdvanceRows } from './vendor-advance-read';

type Filter = {
  readonly status: VendorAdvanceStatus | 'open' | 'all';
  readonly vendorId?: string | undefined;
  readonly purchaseOrderId?: string | undefined;
};

/** Orders an advance can be paid against: placed with the vendor, goods still to come. */
const ADVANCEABLE = ['sent', 'partly_received'] as const;

/**
 * Advances to vendors against a purchase order (PRD 3.10, 3.11), with the bill rules:
 * recorded (finance.record_payments), approved (finance.approve_payments), then paid.
 */
@Injectable()
export class VendorAdvancesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(filter: Filter): Promise<VendorAdvance[]> {
    const conditions: (SQL | undefined)[] = [];
    if (filter.status === 'open') {
      conditions.push(
        or(
          inArray(vendorAdvances.status, ['pending', 'approved']),
          and(
            eq(vendorAdvances.status, 'paid'),
            gt(vendorAdvances.amountPaise, vendorAdvances.adjustedPaise),
          ),
        ),
      );
    } else if (filter.status !== 'all') {
      conditions.push(eq(vendorAdvances.status, filter.status));
    }
    if (filter.vendorId) conditions.push(eq(vendorAdvances.vendorId, filter.vendorId));
    if (filter.purchaseOrderId) {
      conditions.push(eq(vendorAdvances.purchaseOrderId, filter.purchaseOrderId));
    }
    return vendorAdvanceRows(this.db, and(...conditions));
  }

  async create(
    actor: Actor,
    input: { purchaseOrderId: string; amountPaise: number; note: string | null },
  ): Promise<VendorAdvance> {
    const id = await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select({ order: purchaseOrders, vendor: vendors.name })
        .from(purchaseOrders)
        .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
        .where(eq(purchaseOrders.id, input.purchaseOrderId))
        .for('update', { of: purchaseOrders });
      if (!order) throw invalid('Pick a purchase order.', { purchaseOrderId: 'Not found.' });
      if (!ADVANCEABLE.some((status) => status === order.order.status)) {
        throw invalid('Advances are paid on orders sent to the vendor and not yet received.', {
          purchaseOrderId: 'Pick a sent order.',
        });
      }
      const [live] = await tx
        .select({ total: sql<string>`coalesce(sum(${vendorAdvances.amountPaise}), 0)` })
        .from(vendorAdvances)
        .where(
          and(
            eq(vendorAdvances.purchaseOrderId, order.order.id),
            ne(vendorAdvances.status, 'cancelled'),
          ),
        );
      const room = advanceRoom(order.order.totalPaise, Number(live?.total ?? 0));
      if (input.amountPaise > room) {
        throw invalid(`At most ${formatInr(room)} more can be advanced on ${order.order.number}.`, {
          amountPaise: `Up to ${formatInr(room)}.`,
        });
      }
      const number = await nextNumber(tx, 'vendor_advances', 'VA', todayIn());
      const [row] = await tx
        .insert(vendorAdvances)
        .values({
          number,
          vendorId: order.order.vendorId,
          purchaseOrderId: order.order.id,
          amountPaise: input.amountPaise,
          note: input.note,
          recordedByUserId: actor.userId,
        })
        .returning({ id: vendorAdvances.id });
      if (!row) throw new Error('Vendor advance insert returned nothing.');
      await recordAudit(tx, actor.userId, 'vendor_advance.recorded', 'vendor_advance', row.id, {
        number,
        amountPaise: input.amountPaise,
        purchaseOrder: order.order.number,
      });
      await tellApprovers(
        tx,
        actor,
        { id: row.id, number, amountPaise: input.amountPaise },
        { vendor: order.vendor, order: order.order.number, projectId: order.order.projectId },
      );
      return row.id;
    });
    return vendorAdvanceRow(this.db, id);
  }

  async approve(actor: Actor, id: string): Promise<VendorAdvance> {
    await this.db.transaction(async (tx) => {
      const advance = await this.lock(tx, id, 'approve');
      await tx
        .update(vendorAdvances)
        .set({
          status: 'approved',
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(vendorAdvances.id, id));
      await recordAudit(tx, actor.userId, 'vendor_advance.approved', 'vendor_advance', id, {
        amountPaise: advance.amountPaise,
      });
    });
    return vendorAdvanceRow(this.db, id);
  }

  /** Paid: posted to the ledger, then set against any approved bill already on the order. */
  async pay(
    actor: Actor,
    id: string,
    input: { method: MoneyOutMethod; paidOn: string; reference: string | null },
  ): Promise<VendorAdvance> {
    if (input.paidOn > todayIn()) {
      throw invalid('The payment date cannot be in the future.', {
        paidOn: 'Pick today or earlier.',
      });
    }
    await this.db.transaction(async (tx) => {
      const advance = await this.lock(tx, id, 'pay');
      await tx
        .update(vendorAdvances)
        .set({
          status: 'paid',
          paidOn: input.paidOn,
          paidMethod: input.method,
          paidReference: input.reference,
          paidByUserId: actor.userId,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(vendorAdvances.id, id));
      await postVendorAdvancePaid(tx, id, actor.userId);
      const adjusted = await applyVendorAdvances(tx, advance.purchaseOrderId, actor.userId);
      await recordAudit(tx, actor.userId, 'vendor_advance.paid', 'vendor_advance', id, {
        amountPaise: advance.amountPaise,
        method: input.method,
        adjustments: adjusted,
      });
    });
    return vendorAdvanceRow(this.db, id);
  }

  async cancel(actor: Actor, id: string): Promise<VendorAdvance> {
    await this.db.transaction(async (tx) => {
      await this.lock(tx, id, 'cancel');
      await tx
        .update(vendorAdvances)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(vendorAdvances.id, id));
      await recordAudit(tx, actor.userId, 'vendor_advance.cancelled', 'vendor_advance', id);
    });
    return vendorAdvanceRow(this.db, id);
  }

  private async lock(tx: Transaction, id: string, step: VendorAdvanceStep) {
    const [advance] = await tx
      .select()
      .from(vendorAdvances)
      .where(eq(vendorAdvances.id, id))
      .for('update');
    if (!advance) throw notFound('That vendor advance');
    if (!canStepAdvance(advance.status, step)) {
      if (step === 'pay' && advance.status === 'pending') {
        throw conflict('This advance needs approval before it is paid.', 'needs_approval');
      }
      throw conflict(`This advance is already ${advance.status}.`, 'advance_state');
    }
    return advance;
  }
}
