import type { CommandCenter } from '@oneohm/api-contracts';
import {
  changeRequests,
  type Database,
  listPendingApprovals,
  projectTasks,
  serviceRequests,
} from '@oneohm/database';
import type { ApprovalKind } from '@oneohm/domain';
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { inboxHref } from '../business-settings/approval-links';

type Decision = CommandCenter['decisions'][number];
type DecisionKey = Decision['key'];

const counted = sql<number>`count(*)::int`;
const countWhere = async (db: Database, table: PgTable, where: SQL | undefined) =>
  (await db.select({ count: counted }).from(table).where(where))[0]?.count ?? 0;

/** Approvals, each opening "Waiting for my approval" filtered to its kinds (PRD 7.1). */
const APPROVALS: readonly { key: DecisionKey; kinds: readonly ApprovalKind[] }[] = [
  { key: 'discounts', kinds: ['discount'] },
  { key: 'task_reviews', kinds: ['task_review'] },
  { key: 'bills', kinds: ['bill'] },
  { key: 'leave', kinds: ['leave'] },
  { key: 'attendance_corrections', kinds: ['attendance_correction'] },
  { key: 'travel_claims', kinds: ['travel_claim'] },
  { key: 'purchase_requests', kinds: ['purchase_request'] },
  { key: 'vendor_advances', kinds: ['vendor_advance'] },
  { key: 'points', kinds: ['points'] },
  { key: 'bonuses', kinds: ['bonus'] },
  { key: 'incentives', kinds: ['commission', 'referral_reward'] },
];

/**
 * Decisions waiting on someone at OneOhm (PRD 3.1 "pending approvals"), each a count and
 * a link: approvals open the approvals list, work queues open their own screen. The
 * counts come from the same list people approve from, so they always match.
 */
export async function decisionsWaiting(db: Database): Promise<Decision[]> {
  const [pending, changes, service, claims] = await Promise.all([
    listPendingApprovals(db),
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
  ]);
  const approvals = APPROVALS.map(({ key, kinds }) => ({
    key,
    count: pending.filter((item) => kinds.includes(item.kind)).length,
    href: inboxHref(kinds),
  }));
  const queues: Decision[] = [
    { key: 'change_requests', count: changes, href: '/discom?tab=requests' },
    { key: 'service_requests', count: service, href: '/service?tab=requests&view=open' },
    { key: 'bank_claims', count: claims, href: '/finance?tab=loans' },
  ];
  return [...approvals, ...queues].filter((decision) => decision.count > 0);
}
