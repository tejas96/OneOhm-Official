import { describe, expect, it } from 'vitest';
import { taskOf } from '../tasks/task-fixture';
import { inScope } from './task-scope';

describe('inScope', () => {
  it('blocked shows only open tasks that wait for others', () => {
    expect(inScope(taskOf({ blockedBy: ['Survey'] }), 'blocked', 'me')).toBe(true);
    expect(inScope(taskOf({ blockedBy: [] }), 'blocked', 'me')).toBe(false);
    expect(inScope(taskOf({ status: 'completed', blockedBy: ['Survey'] }), 'blocked', 'me')).toBe(
      false,
    );
  });
});
