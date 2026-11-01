import type { QuotationListFilter, QuotationPage } from '@oneohm/api-contracts';
import { customers, type DatabaseExecutor, properties, quotations } from '@oneohm/database';
import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { offsetOf, pageFrom, searchWords } from '../../common/paging';
import { quotationSummaries } from '../../common/read-models/quotation-summary';
import { matchWords } from '../../common/search-match';
import { quotationScope } from '../quotations/quotation-access';

/** A discount above the limit that no approver has passed yet (as `discountPendingApproval`). */
export const waitsForApproval: SQL = sql`(${quotations.discountPaise} > 0 and ${quotations.discountApprovedByUserId} is null and coalesce((${quotations.snapshot}->>'discountNeedsApproval')::boolean, false))`;

function filterOf(filter: QuotationListFilter): SQL | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'approval') return waitsForApproval;
  return eq(quotations.status, filter);
}

/** One page of the quotations the person may see, newest first, found by number, customer or site. */
export async function quotationPage(
  db: DatabaseExecutor,
  actor: Actor,
  query: {
    filter: QuotationListFilter;
    q?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
): Promise<QuotationPage> {
  const scope = quotationScope(actor);
  const where = and(
    scope,
    filterOf(query.filter),
    matchWords(searchWords(query.q), {
      text: [customers.name, properties.label],
      codes: [quotations.number],
    }),
  );
  const offset = offsetOf(query);
  const [ids, [count], [waiting]] = await Promise.all([
    db
      .select({ id: quotations.id })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(properties, eq(properties.id, quotations.propertyId))
      .where(where)
      .orderBy(desc(quotations.createdAt), asc(quotations.id))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(properties, eq(properties.id, quotations.propertyId))
      .where(where),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(quotations)
      .where(and(scope, waitsForApproval)),
  ]);
  const order = ids.map((row) => row.id);
  const rows = order.length ? await quotationSummaries(db, inArray(quotations.id, order)) : [];
  rows.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
  return {
    ...pageFrom(rows, count?.total ?? 0, offset, query.limit),
    waitingApproval: waiting?.total ?? 0,
  };
}
