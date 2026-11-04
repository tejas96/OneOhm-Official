import type { SearchHit } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { hrefOf } from './hit-entry';

function hit(partial: Partial<SearchHit> & Pick<SearchHit, 'type'>): SearchHit {
  return {
    id: 'h1',
    title: 'Found',
    facts: [],
    state: null,
    parent: null,
    amountPaise: null,
    phone: null,
    ...partial,
  };
}

describe('hrefOf', () => {
  it('opens a task in its panel on the project Tasks tab', () => {
    expect(hrefOf(hit({ type: 'tasks', parent: { type: 'projects', id: 'p1' } }))).toBe(
      '/projects/p1?tab=tasks&task=h1',
    );
  });

  it('opens a task with no project in its panel on the task board', () => {
    expect(hrefOf(hit({ type: 'tasks' }))).toBe('/command-center/tasks?task=h1');
  });

  it('opens a vendor file on the vendor Papers tab', () => {
    expect(hrefOf(hit({ type: 'documents', parent: { type: 'vendors', id: 'v1' } }))).toBe(
      '/inventory/vendors/v1?tab=papers',
    );
  });
});
