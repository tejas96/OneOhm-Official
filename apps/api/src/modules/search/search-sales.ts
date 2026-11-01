import { customers, leads, projects, properties, quotations } from '@oneohm/database';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { matchRank, matchWords } from '../../common/search-match';
import { leadVisibility } from '../crm/lead-read';
import { quotationScope } from '../quotations/quotation-access';
import { type Finder, factsOf, hitOf } from './search-hit';
import { seesCustomerPhones } from './search-scope';

/** Projects by code, name, customer, place or the customer's phone. */
export const findProjects: Finder = async ({ db, actor, words, raw, limit }) => {
  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      city: properties.city,
      customer: customers.name,
      phone: customers.phoneE164,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(
      matchWords(words, {
        text: [projects.name, properties.city, customers.name],
        codes: [projects.code],
        phones: [customers.phoneE164],
      }),
    )
    .orderBy(
      matchRank(raw, [projects.code, projects.name, customers.name]),
      desc(projects.createdAt),
    )
    .limit(limit);
  return rows.map((row) =>
    hitOf('projects', row.id, row.name, {
      facts: factsOf(row.code, row.customer === row.name ? null : row.customer, row.city),
      state: row.status,
      phone: seesCustomerPhones(actor) ? row.phone : null,
    }),
  );
};

/** Customers by name, email or phone, with the town of their first site. */
export const findCustomers: Finder = async ({ db, words, raw, limit }) => {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phoneE164,
      city: sql<
        string | null
      >`(select ${properties}.city from ${properties} where ${properties}.customer_id = ${customers}.id order by ${properties}.created_at limit 1)`,
    })
    .from(customers)
    .where(
      matchWords(words, { text: [customers.name, customers.email], phones: [customers.phoneE164] }),
    )
    .orderBy(matchRank(raw, [customers.name]), desc(customers.createdAt))
    .limit(limit);
  return rows.map((row) =>
    hitOf('customers', row.id, row.name, { facts: factsOf(row.city), phone: row.phone }),
  );
};

/** Leads the person may see (resellers and owners only their own). */
export const findLeads: Finder = async ({ db, actor, words, raw, limit }) => {
  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        leadVisibility(actor),
        matchWords(words, {
          text: [leads.name, leads.city, leads.email],
          phones: [leads.phoneE164],
        }),
      ),
    )
    .orderBy(matchRank(raw, [leads.name]), desc(leads.createdAt))
    .limit(limit);
  return rows.map((row) =>
    hitOf('leads', row.id, row.name, {
      facts: factsOf(row.city),
      state: row.stage,
      phone: row.phoneE164,
    }),
  );
};

/** Live quotations (not replaced revisions) the person may see, by number, customer or site. */
export const findQuotations: Finder = async ({ db, actor, words, raw, limit }) => {
  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      status: quotations.status,
      effectivePaise: quotations.effectivePaise,
      customer: customers.name,
      site: properties.label,
    })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .innerJoin(properties, eq(properties.id, quotations.propertyId))
    .where(
      and(
        quotationScope(actor),
        ne(quotations.status, 'superseded'),
        matchWords(words, { text: [customers.name, properties.label], codes: [quotations.number] }),
      ),
    )
    .orderBy(matchRank(raw, [quotations.number, customers.name]), desc(quotations.createdAt))
    .limit(limit);
  return rows.map((row) =>
    hitOf('quotations', row.id, row.number, {
      facts: factsOf(row.customer, row.site),
      state: row.status,
      amountPaise: row.effectivePaise,
    }),
  );
};
