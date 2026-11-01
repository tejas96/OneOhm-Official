import type { LeadListFilter, LeadPage } from '@oneohm/api-contracts';
import { type DatabaseExecutor, leads } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, asc, desc, eq, lte, notInArray, or, type SQL, sql } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { offsetOf, pageFrom, searchWords } from '../../common/paging';
import { matchWords } from '../../common/search-match';
import { presentLeads } from '../crm/lead-present';
import { leadVisibility, needsFollowUp, unownedLeads } from '../crm/lead-read';

const open = notInArray(leads.stage, ['won', 'lost']);

/** Lost leads whose revisit day has come, and open leads whose next step is today or late. */
function dueNow(today: string): SQL {
  return (
    or(
      and(eq(leads.stage, 'lost'), lte(leads.revisitOn, today)),
      and(open, lte(leads.nextActionOn, today)),
    ) ?? open
  );
}

function filterOf(db: DatabaseExecutor, filter: LeadListFilter, today: string): SQL | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'open') return needsFollowUp(today);
  if (filter === 'due') return dueNow(today);
  if (filter === 'unowned') return unownedLeads(db);
  return eq(leads.stage, filter);
}

/**
 * One page of the leads the person may see (resellers and owners only their own), next
 * follow-up first, with the late and today counts of every match for the figures.
 */
export async function leadPage(
  db: DatabaseExecutor,
  actor: Actor,
  query: {
    filter: LeadListFilter;
    q?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
): Promise<LeadPage> {
  const today = todayIn();
  const where = and(
    leadVisibility(actor),
    filterOf(db, query.filter, today),
    matchWords(searchWords(query.q), {
      text: [leads.name, leads.city, leads.email],
      phones: [leads.phoneE164],
    }),
  );
  const offset = offsetOf(query);
  const [rows, [counts]] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(where)
      .orderBy(asc(leads.nextActionOn), desc(leads.createdAt), asc(leads.id))
      .limit(query.limit)
      .offset(offset),
    db
      .select({
        total: sql<number>`count(*)::int`,
        overdue: sql<number>`(count(*) filter (where ${open} and ${leads.nextActionOn} < ${today}))::int`,
        dueToday: sql<number>`(count(*) filter (where ${open} and ${leads.nextActionOn} = ${today}))::int`,
      })
      .from(leads)
      .where(where),
  ]);
  const total = counts?.total ?? 0;
  return {
    ...pageFrom(await presentLeads(db, rows), total, offset, query.limit),
    overdue: counts?.overdue ?? 0,
    dueToday: counts?.dueToday ?? 0,
  };
}
