import { Sun } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  haystackOf,
  normalise,
  type SearchEntry,
  type SearchGroup,
  searchEntries,
} from './search-index';

function entry(group: SearchGroup, id: string, title: string, fields: string[] = []): SearchEntry {
  return {
    id: `${group}:${id}`,
    group,
    title,
    detail: '',
    href: `/${group}/${id}`,
    icon: Sun,
    haystack: haystackOf([title, ...fields]),
    keys: [normalise(title)],
  };
}

const PAGES = [
  entry('pages', 'projects', 'Projects', ['Work']),
  entry('pages', 'customers', 'Customers', ['Sales']),
  entry('pages', 'service', 'Service desk', ['After-sales']),
];

const ids = (groups: ReturnType<typeof searchEntries>) =>
  groups.flatMap((group) => group.entries.map((found) => found.id));

describe('palette search', () => {
  it('shows only pages before anything is typed', () => {
    const groups = searchEntries(PAGES, [entry('projects', 'p1', 'Patil residence')], '  ');
    expect(groups.map((group) => group.group)).toEqual(['pages']);
  });

  it('matches pages by every word and ranks a name that starts with the query first', () => {
    expect(ids(searchEntries(PAGES, [], 'serv'))).toEqual(['pages:service']);
    expect(ids(searchEntries(PAGES, [], 'cus sales'))).toEqual(['pages:customers']);
  });

  it('keeps the server order of records and groups them in a fixed order', () => {
    const records = [
      entry('tasks', 't1', 'Install inverter'),
      entry('projects', 'p2', 'Patil residence'),
      entry('projects', 'p1', 'Patil farm'),
      entry('customers', 'c1', 'Anil Patil'),
    ];
    const groups = searchEntries(PAGES, records, 'patil');
    expect(groups.map((group) => group.group)).toEqual(['projects', 'customers', 'tasks']);
    expect(ids(groups)).toEqual(['projects:p2', 'projects:p1', 'customers:c1', 'tasks:t1']);
  });

  it('shows pages before records when both match', () => {
    const groups = searchEntries(PAGES, [entry('customers', 'c1', 'Customers Ltd')], 'customers');
    expect(groups.map((group) => group.group)).toEqual(['pages', 'customers']);
  });
});
