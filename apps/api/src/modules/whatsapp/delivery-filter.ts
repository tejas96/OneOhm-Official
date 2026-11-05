import type { Delivery } from '@oneohm/api-contracts';
import { outbox } from '@oneohm/database';
import { and, eq, inArray, not, or, type SQL, sql } from 'drizzle-orm';
import { searchWords } from '../../common/paging';
import { matchWords } from '../../common/search-match';

/** A receipt that settles the state on its own, whatever the outbox says. */
const receipt = sql`coalesce(${outbox.deliveryStatus}, '') in ('failed', 'read', 'delivered')`;

/** The same states `deliveryState` works out, as a condition the database can filter on. */
export function deliveryStateWhere(state: Delivery['state'] | undefined): SQL | undefined {
  if (!state) return undefined;
  const failed = or(eq(outbox.status, 'failed'), eq(outbox.deliveryStatus, 'failed'));
  if (state === 'failed') return failed;
  if (state === 'read' || state === 'delivered')
    return and(not(eq(outbox.status, 'failed')), eq(outbox.deliveryStatus, state));
  if (state === 'sent') return and(eq(outbox.status, 'sent'), not(receipt));
  if (state === 'skipped') return and(eq(outbox.status, 'skipped'), not(receipt));
  return and(not(inArray(outbox.status, ['failed', 'sent', 'skipped'])), not(receipt));
}

/**
 * Who a message went to by name: the customer with that WhatsApp or SMS number, or the
 * person an app alert was for. Written by hand: a one-table select leaves columns unqualified.
 */
const recipientName = sql`coalesce(
  (select c.name from customers c where c.phone_e164 = ${outbox}.recipient limit 1),
  (select coalesce(u.full_name, c.name) from notifications n
    left join users u on u.id = n.user_id
    left join customers c on c.id = n.customer_id
    where ${outbox}.channel = 'push' and n.id::text = ${outbox}.recipient)
)`;

/** A message by recipient phone or name, or the template it used. */
export function deliverySearch(q: string | undefined): SQL | undefined {
  return matchWords(searchWords(q), {
    text: [outbox.template, recipientName],
    phones: [outbox.recipient],
  });
}
