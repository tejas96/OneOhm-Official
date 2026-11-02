import { describe, expect, it } from 'vitest';
import { panelNavigation, panelView, withTask } from './task-panel-url';

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

describe('panelNavigation', () => {
  it('adds a history entry when a panel opens, so Back closes it', () => {
    expect(panelNavigation(null, 't1')).toBe('push');
  });

  it('replaces when switching tasks or closing', () => {
    expect(panelNavigation('t1', 't2')).toBe('replace');
    expect(panelNavigation('t1', null)).toBe('replace');
  });
});

describe('panelView', () => {
  const task = { id: 't1' };
  it('keeps showing a loaded task when a later refetch fails', () => {
    expect(panelView({ data: task, isPending: false, isError: true, missing: false })).toBe('body');
  });

  it('shows not found, error and loading only without a task', () => {
    expect(panelView({ data: undefined, isPending: false, isError: true, missing: true })).toBe(
      'missing',
    );
    expect(panelView({ data: undefined, isPending: false, isError: true, missing: false })).toBe(
      'error',
    );
    expect(panelView({ data: undefined, isPending: true, isError: false, missing: false })).toBe(
      'loading',
    );
  });
});
