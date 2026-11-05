import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { serviceSearch } from './service-search';

const render = (q: string) => {
  const where = serviceSearch(q);
  if (!where) throw new Error('No condition built.');
  return new PgDialect().sqlToQuery(where);
};

describe('service desk search', () => {
  it('adds nothing for an empty search', () => {
    expect(serviceSearch(undefined)).toBeUndefined();
    expect(serviceSearch('  ')).toBeUndefined();
  });

  it('looks at the customer, what went wrong, the category and the project code', () => {
    const query = render('inverter');
    expect(query.sql).toContain('"customers"."name" ilike');
    expect(query.sql).toContain('"service_requests"."description" ilike');
    expect(query.sql).toContain('"service_categories"."label" ilike');
    expect(query.sql).toContain('"projects"."code" ilike');
    expect(query.params).toContain('%inverter%');
  });

  it('matches a phone number digit for digit', () => {
    const query = render('98765 43210');
    expect(query.sql).toContain('"customers"."phone_e164"');
    expect(query.params).toContain('%98765%');
  });
});
