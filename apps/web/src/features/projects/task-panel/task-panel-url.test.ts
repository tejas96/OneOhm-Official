import { describe, expect, it } from 'vitest';
import { hrefWithTask, panelNavigation, panelShown, panelView, withTask } from './task-panel-url';

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

describe('hrefWithTask', () => {
  it('adds the task to a link that has a query', () => {
    expect(hrefWithTask('/projects/p1?tab=tasks', 't1')).toBe('/projects/p1?tab=tasks&task=t1');
  });

  it('adds the task to a bare path', () => {
    expect(hrefWithTask('/today', 't1')).toBe('/today?task=t1');
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

describe('panelShown', () => {
  it('keeps the closing task on screen until its animation ends', () => {
    expect(panelShown('t1', null)).toEqual({ id: 't1', open: false });
  });

  it('shows the task the link asks for', () => {
    expect(panelShown(null, 't2')).toEqual({ id: 't2', open: true });
    expect(panelShown('t1', 't2')).toEqual({ id: 't2', open: true });
  });

  it('shows nothing when nothing was open', () => {
    expect(panelShown(null, null)).toEqual({ id: null, open: false });
  });
});
