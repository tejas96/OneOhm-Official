import type { CustomerPage } from '@oneohm/api-contracts';
import { customers, type DatabaseExecutor, projects, properties } from '@oneohm/database';
import { asc, sql } from 'drizzle-orm';
import { offsetOf, pageFrom, searchWords } from '../../common/paging';
import { matchWords } from '../../common/search-match';

/** One page of customers by name, each with how many sites and projects they have. */
export async function customerPage(
  db: DatabaseExecutor,
  query: { q?: string | undefined; limit: number; cursor?: string | undefined },
): Promise<CustomerPage> {
  const where = matchWords(searchWords(query.q), {
    text: [customers.name, customers.email],
    phones: [customers.phoneE164],
  });
  const offset = offsetOf(query);
  const [rows, [count]] = await Promise.all([
    db
      .select({
        customer: customers,
        // Qualified by hand: a one-table select names its columns without their table.
        propertyCount: sql<number>`(select count(*) from ${properties} where ${properties}.customer_id = ${customers}.id)::int`,
        projectCount: sql<number>`(select count(*) from ${projects} where ${projects}.customer_id = ${customers}.id)::int`,
      })
      .from(customers)
      .where(where)
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);
  const items = rows.map(({ customer, propertyCount, projectCount }) => ({
    id: customer.id,
    kind: customer.kind,
    name: customer.name,
    phone: customer.phoneE164,
    email: customer.email,
    gstin: customer.gstin,
    createdAt: customer.createdAt.toISOString(),
    propertyCount,
    projectCount,
  }));
  return pageFrom(items, count?.total ?? 0, offset, query.limit);
}
