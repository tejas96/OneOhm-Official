import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { chatSearch } from './chat-summaries';

describe('inbox search', () => {
  it('adds nothing for an empty search', () => {
    expect(chatSearch('')).toBeUndefined();
  });

  it('finds a chat by customer name, WhatsApp name or either phone', () => {
    const where = chatSearch('sunita 98765');
    if (!where) throw new Error('No condition built.');
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).toContain('"customers"."name" ilike');
    expect(query.sql).toContain('"wa_conversations"."profile_name" ilike');
    expect(query.sql).toContain('"wa_conversations"."phone"');
    expect(query.sql).toContain('"customers"."phone_e164"');
    expect(query.params).toEqual(expect.arrayContaining(['%sunita%', '%98765%']));
  });
});
