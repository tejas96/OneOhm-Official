import { Sun } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  haystackOf,
  normalise,
  type SearchEntry,
  type SearchGroup,
  searchEntries,
} from './search-index';

function entry(group: SearchGroup, id: string, title: string, fields: string[]): SearchEntry {
  return {
    id: `${group}:${id}`,
    group,
    title,
    detail: '',
    href: `/${group}/${id}`,
    icon: Sun,
    haystack: haystackOf([title, ...fields]),
    keys: [normalise(title), ...fields.map(normalise)],
  };
}

const ENTRIES = [
  entry('pages', 'projects', 'Projects', []),
  entry('pages', 'customers', 'Customers', []),
  entry('projects', 'p2', 'Patil residence', ['OH-2026-002', 'Miraj']),
  entry('projects', 'p12', 'Kulkarni society', ['OH-2026-012', 'Sangli']),
  entry('customers', 'c1', 'Anil Patil', ['+919876543210']),
  entry('quotations', 'q1', 'OQ-2026-0002', ['Anil Patil']),
];

const ids = (query: string) =>
  searchEntries(ENTRIES, query).flatMap((group) => group.entries.map((found) => found.id));

describe('palette search', () => {
  it('shows only pages before anything is typed', () => {
    const groups = searchEntries(ENTRIES, '  ');
    expect(groups.map((group) => group.group)).toEqual(['pages']);
  });

  it('finds a project by its code, with or without dashes', () => {
    expect(ids('OH-2026-002')).toEqual(['projects:p2']);
    expect(ids('oh2026012')).toEqual(['projects:p12']);
  });

  it('matches every word anywhere in the record', () => {
    expect(ids('patil miraj')).toEqual(['projects:p2']);
  });

  it('finds a phone number typed with spaces or without the country code', () => {
    expect(ids('98765 43210')).toEqual(['customers:c1']);
    expect(ids('9876543210')).toEqual(['customers:c1']);
  });

  it('keeps the group order and ranks names that start with the query first', () => {
    const groups = searchEntries(ENTRIES, 'patil');
    expect(groups.map((group) => group.group)).toEqual(['projects', 'customers', 'quotations']);
  });

  it('caps records per group but never pages', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      entry('leads', `l${index}`, `Lead ${index}`, []),
    );
    const [leads] = searchEntries(many, 'lead');
    expect(leads?.entries).toHaveLength(5);
  });
});
