import type { VendorAdvance } from '@oneohm/api-contracts';
import {
  payables,
  projects,
  purchaseOrders,
  users,
  vendorAdvanceAdjustments,
  vendorAdvances,
  vendors,
} from '@oneohm/database';
import { asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';

const recorders = alias(users, 'recorders');
const approvers = alias(users, 'approvers');

type Reader = Pick<Database, 'select'>;

/** Advances with their order and every bill they were set against, newest first. */
export async function vendorAdvanceRows(db: Reader, where?: SQL): Promise<VendorAdvance[]> {
  const rows = await db
    .select({
      advance: vendorAdvances,
      vendor: vendors.name,
      order: {
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        status: purchaseOrders.status,
        totalPaise: purchaseOrders.totalPaise,
      },
      projectCode: projects.code,
      recorder: recorders.fullName,
      approver: approvers.fullName,
    })
    .from(vendorAdvances)
    .innerJoin(vendors, eq(vendors.id, vendorAdvances.vendorId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, vendorAdvances.purchaseOrderId))
    .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .leftJoin(recorders, eq(recorders.id, vendorAdvances.recordedByUserId))
    .leftJoin(approvers, eq(approvers.id, vendorAdvances.approvedByUserId))
    .where(where)
    .orderBy(desc(vendorAdvances.createdAt))
    .limit(300);
  if (rows.length === 0) return [];
  const adjustments = await db
    .select({ adjustment: vendorAdvanceAdjustments, description: payables.description })
    .from(vendorAdvanceAdjustments)
    .innerJoin(payables, eq(payables.id, vendorAdvanceAdjustments.payableId))
    .where(
      inArray(
        vendorAdvanceAdjustments.advanceId,
        rows.map((row) => row.advance.id),
      ),
    )
    .orderBy(asc(vendorAdvanceAdjustments.createdAt));
  return rows.map(({ advance, ...row }) => ({
    id: advance.id,
    number: advance.number,
    status: advance.status,
    vendor: { id: advance.vendorId, name: row.vendor },
    purchaseOrder: row.order,
    projectCode: row.projectCode,
    amountPaise: advance.amountPaise,
    adjustedPaise: advance.adjustedPaise,
    openPaise: advance.status === 'paid' ? advance.amountPaise - advance.adjustedPaise : 0,
    note: advance.note,
    recordedBy:
      advance.recordedByUserId && row.recorder
        ? { id: advance.recordedByUserId, fullName: row.recorder }
        : null,
    approvedBy:
      advance.approvedByUserId && row.approver
        ? { id: advance.approvedByUserId, fullName: row.approver }
        : null,
    approvedAt: advance.approvedAt?.toISOString() ?? null,
    paidOn: advance.paidOn,
    paidMethod: advance.paidMethod,
    paidReference: advance.paidReference,
    createdAt: advance.createdAt.toISOString(),
    adjustments: adjustments
      .filter((entry) => entry.adjustment.advanceId === advance.id)
      .map((entry) => ({
        payableId: entry.adjustment.payableId,
        description: entry.description,
        amountPaise: entry.adjustment.amountPaise,
        adjustedOn: entry.adjustment.adjustedOn,
      })),
  }));
}

export async function vendorAdvanceRow(db: Reader, id: string): Promise<VendorAdvance> {
  const [row] = await vendorAdvanceRows(db, eq(vendorAdvances.id, id));
  if (!row) throw notFound('That vendor advance');
  return row;
}
