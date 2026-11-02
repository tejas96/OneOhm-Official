import { describe, expect, it } from 'vitest';
import { withTask } from './task-panel-url';

describe('withTask', () => {
  it('adds the task and keeps other params', () => {
    expect(withTask('?tab=tasks&layout=list', 't1')).toBe('?tab=tasks&layout=list&task=t1');
  });

  it('replaces an open task', () => {
    expect(withTask('?task=t1', 't2')).toBe('?task=t2');
  });

  it('removes it and leaves nothing when empty', () => {
    expect(withTask('?task=t1', null)).toBe('');
  });

  it('removes it and keeps the rest', () => {
    expect(withTask('?tab=tasks&task=t1', null)).toBe('?tab=tasks');
  });
});
