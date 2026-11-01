import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import type { PendingApprovalRow } from './pending-approvals';
import { rewardRows } from './pending-approvals-rewards';
import { readableDay } from './readable-day';
import { customers } from './schema/crm.schema';
import { payables } from './schema/finance.schema';
import { users } from './schema/identity.schema';
import { vendors } from './schema/inventory.schema';
import { projects } from './schema/projects.schema';
import { purchaseRequests, vendorAdvances } from './schema/purchasing.schema';
import { quotations } from './schema/quotations.schema';
import { travelClaims } from './schema/site-activity.schema';

const iso = (value: Date) => value.toISOString();
const noProject = { projectId: null, projectCode: null } as const;

/** Discounts over the limit in Settings that nobody has approved yet (PRD 3.9). */
async function discountRows(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const rows = await db
    .select({
      id: quotations.id,
      at: quotations.createdAt,
      by: quotations.createdByUserId,
      number: quotations.number,
      revision: quotations.revision,
      amount: quotations.discountPaise,
      snapshot: quotations.snapshot,
      customer: customers.name,
      name: users.fullName,
    })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(users, eq(users.id, quotations.createdByUserId))
    .where(
      and(
        inArray(quotations.status, ['draft', 'sent']),
        isNull(quotations.discountApprovedByUserId),
        ne(quotations.discountPaise, 0),
      ),
    );
  return rows
    .filter(
      (row) =>
        (row.snapshot as { discountNeedsApproval?: boolean } | null)?.discountNeedsApproval ===
        true,
    )
    .map((row) => ({
      ...noProject,
      kind: 'discount',
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.by,
      amountPaise: row.amount,
      subject: `${row.number}${row.revision > 1 ? ` (rev ${row.revision})` : ''} · ${row.customer}`,
      requesterName: row.name,
    }));
}

async function claimRows(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const travel = await db
    .select({
      id: travelClaims.id,
      at: travelClaims.createdAt,
      by: travelClaims.userId,
      day: travelClaims.workDate,
      amount: travelClaims.amountPaise,
      name: users.fullName,
      projectId: travelClaims.projectId,
      code: projects.code,
    })
    .from(travelClaims)
    .innerJoin(users, eq(users.id, travelClaims.userId))
    .leftJoin(projects, eq(projects.id, travelClaims.projectId))
    .where(eq(travelClaims.status, 'pending'));
  const requests = await db
    .select({
      id: purchaseRequests.id,
      at: purchaseRequests.createdAt,
      by: purchaseRequests.requestedByUserId,
      number: purchaseRequests.number,
      reason: purchaseRequests.reason,
      name: users.fullName,
      projectId: purchaseRequests.projectId,
      code: projects.code,
    })
    .from(purchaseRequests)
    .innerJoin(users, eq(users.id, purchaseRequests.requestedByUserId))
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .where(eq(purchaseRequests.status, 'pending'));
  return [
    ...travel.map((row) => ({
      kind: 'travel_claim' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.by,
      amountPaise: row.amount,
      subject: readableDay(row.day),
      requesterName: row.name,
      projectId: row.projectId,
      projectCode: row.code,
    })),
    ...requests.map((row) => ({
      kind: 'purchase_request' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.by,
      amountPaise: null,
      subject: `${row.number} · ${row.reason}`,
      requesterName: row.name,
      projectId: row.projectId,
      projectCode: row.code,
    })),
  ];
}

async function billRows(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const advances = await db
    .select({
      id: vendorAdvances.id,
      at: vendorAdvances.createdAt,
      by: vendorAdvances.recordedByUserId,
      number: vendorAdvances.number,
      amount: vendorAdvances.amountPaise,
      vendor: vendors.name,
      name: users.fullName,
    })
    .from(vendorAdvances)
    .innerJoin(vendors, eq(vendors.id, vendorAdvances.vendorId))
    .leftJoin(users, eq(users.id, vendorAdvances.recordedByUserId))
    .where(eq(vendorAdvances.status, 'pending'));
  const bills = await db
    .select({
      id: payables.id,
      at: payables.createdAt,
      party: payables.partyName,
      partyUserId: payables.partyUserId,
      description: payables.description,
      amount: payables.amountPaise,
      projectId: payables.projectId,
      code: projects.code,
    })
    .from(payables)
    .leftJoin(projects, eq(projects.id, payables.projectId))
    .where(eq(payables.status, 'pending'));
  return [
    ...advances.map((row) => ({
      ...noProject,
      kind: 'vendor_advance' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.by,
      amountPaise: row.amount,
      subject: `${row.number} · ${row.vendor}`,
      requesterName: row.name,
    })),
    ...bills.map((row) => ({
      kind: 'bill' as const,
      id: row.id,
      requestedAt: iso(row.at),
      // An employee's own claim is never theirs to approve.
      requestedByUserId: row.partyUserId,
      amountPaise: row.amount,
      subject: `${row.party} · ${row.description}`,
      requesterName: null,
      projectId: row.projectId,
      projectCode: row.code,
    })),
  ];
}

/** Approvals that move money or price: discounts, claims, bills, bonuses and payouts. */
export async function moneyApprovals(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const groups = await Promise.all([discountRows(db), claimRows(db), billRows(db), rewardRows(db)]);
  return groups.flat();
}
