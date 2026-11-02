import { describe, expect, it } from 'vitest';
import { blockingTitles } from './task-blocking';

describe('blockingTitles', () => {
  const deps = [
    { dependsOnTaskId: 'a', title: 'Structure install', status: 'pending' },
    { dependsOnTaskId: 'a', title: 'Panel install', status: 'ready' },
    { dependsOnTaskId: 'a', title: 'Old step', status: 'completed' },
    { dependsOnTaskId: 'b', title: 'Other', status: 'pending' },
  ] as const;

  it('lists open tasks waiting on this one', () => {
    expect(blockingTitles('a', false, deps)).toEqual(['Structure install', 'Panel install']);
  });

  it('is empty once this task is done', () => {
    expect(blockingTitles('a', true, deps)).toEqual([]);
  });
});
