import { customers, type DatabaseExecutor, quotations } from '@oneohm/database';
import { and, asc, eq, gte, type SQL, sql } from 'drizzle-orm';

/**
 * No project was set up from this quotation number yet: no project is on any revision of
 * it, and none waits on it as its survey revision.
 */
const noProject: SQL = sql`not exists (
  select 1 from projects p join quotations pq on pq.id = p.quotation_id
   where pq.number = ${quotations.number} or p.revision_quotation_id = ${quotations.id})`;

/** True when a project already runs on this quotation number (a revision or a change). */
export async function quoteHasProject(db: DatabaseExecutor, quotationId: string): Promise<boolean> {
  const [open] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), noProject));
  return !open;
}

/** Accepted quotations nobody has started a project for, oldest first; `since` narrows them. */
export function acceptedWithoutProject(db: DatabaseExecutor, since?: Date) {
  return db
    .select({
      id: quotations.id,
      number: quotations.number,
      acceptedAt: quotations.acceptedAt,
      customer: customers.name,
    })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(
      and(
        eq(quotations.status, 'accepted'),
        since ? gte(quotations.acceptedAt, since) : undefined,
        noProject,
      ),
    )
    .orderBy(asc(quotations.acceptedAt));
}
