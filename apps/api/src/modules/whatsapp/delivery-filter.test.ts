import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { deliverySearch, deliveryStateWhere } from './delivery-filter';

const render = (where: ReturnType<typeof deliverySearch>) => {
  if (!where) throw new Error('No condition built.');
  return new PgDialect().sqlToQuery(where);
};

describe('message log filters in the database', () => {
  it('reads every message when no state is asked for', () => {
    expect(deliveryStateWhere(undefined)).toBeUndefined();
  });

  it('counts a failed receipt as failed even when the outbox says sent', () => {
    const query = render(deliveryStateWhere('failed'));
    expect(query.sql).toContain('"outbox"."status" = $');
    expect(query.sql).toContain('"outbox"."delivery_status" = $');
    expect(query.params).toEqual(['failed', 'failed']);
  });

  it('keeps sent to messages without a later receipt', () => {
    const query = render(deliveryStateWhere('sent'));
    expect(query.sql).toContain("in ('failed', 'read', 'delivered')");
    expect(query.params).toEqual(['sent']);
  });

  it('finds a message by template, recipient name or phone', () => {
    const query = render(deliverySearch('9876543210'));
    expect(query.sql).toContain('"outbox"."template" ilike');
    expect(query.sql).toContain('from customers c');
    expect(query.sql).toContain('regexp_replace(coalesce("outbox"."recipient"');
    expect(query.params).toContain('%9876543210%');
  });
});
