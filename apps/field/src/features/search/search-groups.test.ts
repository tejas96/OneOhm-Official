import type { SearchHit } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { detailLine, groupHits, searchable } from './search-groups';

function hit(type: SearchHit['type'], id: string, facts: string[] = []): SearchHit {
  return {
    type,
    id,
    title: id,
    facts,
    state: null,
    parent: null,
    amountPaise: null,
    phone: null,
  };
}

describe('field search groups', () => {
  it('groups by kind in a fixed order and keeps the server order inside each', () => {
    const groups = groupHits([
      hit('tasks', 't1'),
      hit('leads', 'l1'),
      hit('projects', 'p1'),
      hit('tasks', 't2'),
    ]);
    expect(groups.map((group) => group.type)).toEqual(['projects', 'leads', 'tasks']);
    expect(groups[2]?.hits.map((found) => found.id)).toEqual(['t1', 't2']);
  });

  it('leaves out kinds the field app does not open', () => {
    expect(groupHits([hit('payments', 'r1'), hit('vendors', 'v1')])).toEqual([]);
  });

  it('joins the facts and the state that are present', () => {
    expect(detailLine(hit('projects', 'p1', ['OH-2026-002', 'Miraj']), 'Active')).toBe(
      'OH-2026-002 · Miraj · Active',
    );
    expect(detailLine(hit('customers', 'c1'), null)).toBe('');
  });

  it('asks the server only from two letters', () => {
    expect(searchable(' a ')).toBe(false);
    expect(searchable('ab')).toBe(true);
  });
});
