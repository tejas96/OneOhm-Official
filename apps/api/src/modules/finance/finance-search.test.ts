import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { invoiceMatch, journalMatch, journalNumberOf, paymentMatch } from './finance-search';

const render = (condition: SQL | undefined) => {
  if (!condition) throw new Error('No condition built.');
  return new PgDialect().sqlToQuery(condition);
};

describe('finance list searches', () => {
  it('builds nothing for an empty search, so the whole list shows', () => {
    expect(invoiceMatch(undefined)).toBeUndefined();
    expect(paymentMatch('   ')).toBeUndefined();
    expect(journalMatch('')).toBeUndefined();
  });

  it('finds invoices by number, customer, GSTIN and project code', () => {
    const query = render(invoiceMatch('Patil OH/INV/2026'));
    expect(query.sql).toContain('"customers"."name"');
    expect(query.sql).toContain('"customer_invoices"."customer_gstin"');
    expect(query.sql).toContain('"customer_invoices"."number"');
    expect(query.sql).toContain('"projects"."code"');
    expect(query.params).toContain('%patil%');
    // A number typed without its slashes still finds it.
    expect(query.params).toContain('%ohinv2026%');
  });

  it('finds payments by receipt, customer, project, milestone and reference', () => {
    const query = render(paymentMatch('utr123'));
    for (const column of [
      '"payments"."receipt_number"',
      '"payments"."reference"',
      '"customers"."name"',
      '"projects"."code"',
      '"payment_milestones"."label"',
    ])
      expect(query.sql).toContain(column);
    expect(query.params).toContain('%utr123%');
  });

  it('reads a JV number as written on the screen', () => {
    expect(journalNumberOf('JV-12')).toBe(12);
    expect(journalNumberOf('jv12')).toBe(12);
    expect(journalNumberOf('12')).toBe(12);
    expect(journalNumberOf('jv')).toBeNull();
    expect(journalNumberOf('rent')).toBeNull();
  });

  it('matches a lone number against the JV number and the memo', () => {
    const query = render(journalMatch('jv-42'));
    expect(query.sql).toContain('"journal_entries"."number" = $');
    expect(query.sql).toContain('"journal_entries"."memo"');
    expect(query.params).toContain(42);
  });

  it('matches words against the memo and project code only', () => {
    const query = render(journalMatch('cement bill'));
    expect(query.sql).not.toContain('"journal_entries"."number" =');
    expect(query.params).toEqual(expect.arrayContaining(['%cement%', '%bill%']));
  });
});
