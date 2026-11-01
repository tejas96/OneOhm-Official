import type { CommandCenter } from '@oneohm/api-contracts';
import {
  attendanceCorrections,
  changeRequests,
  commissionEntries,
  type Database,
  leaveRequests,
  payables,
  pointsEntries,
  projectTasks,
  purchaseRequests,
  quotations,
  referralRewards,
  serviceRequests,
  travelClaims,
  vendorAdvances,
} from '@oneohm/database';
import { and, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

type Decision = CommandCenter['decisions'][number];

const counted = sql<number>`count(*)::int`;
const countWhere = async (db: Database, table: PgTable, where: SQL | undefined) =>
  (await db.select({ count: counted }).from(table).where(where))[0]?.count ?? 0;

/**
 * Decisions waiting on someone at OneOhm (PRD 3.1 "pending approvals"), each a count and
 * a link to the screen where it is decided. Empty ones are left out.
 */
export async function decisionsWaiting(db: Database): Promise<CommandCenter['decisions']> {
  const counts = await Promise.all([
    countWhere(
      db,
      quotations,
      and(
        inArray(quotations.status, ['draft', 'sent']),
        isNull(quotations.discountApprovedByUserId),
        ne(quotations.discountPaise, 0),
      ),
    ),
    countWhere(db, projectTasks, eq(projectTasks.status, 'in_review')),
    countWhere(db, payables, eq(payables.status, 'pending')),
    countWhere(db, changeRequests, eq(changeRequests.status, 'open')),
    countWhere(db, serviceRequests, eq(serviceRequests.status, 'open')),
    countWhere(
      db,
      projectTasks,
      and(
        eq(projectTasks.templateKey, 'loan_disbursement_claim'),
        inArray(projectTasks.status, ['ready', 'in_progress']),
      ),
    ),
    countWhere(db, leaveRequests, eq(leaveRequests.status, 'pending')),
    countWhere(db, attendanceCorrections, eq(attendanceCorrections.status, 'pending')),
    countWhere(db, travelClaims, eq(travelClaims.status, 'pending')),
    countWhere(db, purchaseRequests, eq(purchaseRequests.status, 'pending')),
    countWhere(db, vendorAdvances, eq(vendorAdvances.status, 'pending')),
    countWhere(db, pointsEntries, eq(pointsEntries.status, 'pending')),
    countWhere(db, commissionEntries, eq(commissionEntries.status, 'pending')),
    countWhere(db, referralRewards, eq(referralRewards.status, 'pending')),
  ]);
  const [commissions = 0, rewards = 0] = counts.splice(-2);
  const links: readonly Omit<Decision, 'count'>[] = [
    { key: 'discounts', href: '/quotations?filter=approval' },
    { key: 'task_reviews', href: '/command-center/tasks?show=review' },
    { key: 'bills', href: '/finance?tab=payables&filter=pending' },
    { key: 'change_requests', href: '/discom?tab=requests' },
    { key: 'service_requests', href: '/service?tab=requests&view=open' },
    { key: 'bank_claims', href: '/finance?tab=loans' },
    { key: 'leave', href: '/team?tab=leave' },
    { key: 'attendance_corrections', href: '/team?tab=attendance' },
    { key: 'travel_claims', href: '/team?tab=travel' },
    { key: 'purchase_requests', href: '/inventory?tab=requests' },
    { key: 'vendor_advances', href: '/finance?tab=advances' },
    { key: 'points', href: '/team?tab=points' },
  ];
  return [
    ...links.map((link, index) => ({ ...link, count: counts[index] ?? 0 })),
    {
      key: 'incentives' as const,
      count: commissions + rewards,
      // Payouts opens on commissions; go straight to referrals when only those wait.
      href: commissions > 0 ? '/finance?tab=payouts' : '/finance?tab=payouts&view=referrals',
    },
  ].filter((decision) => decision.count > 0);
}
