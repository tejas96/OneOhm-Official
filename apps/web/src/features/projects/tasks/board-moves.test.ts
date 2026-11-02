import { describe, expect, it } from 'vitest';
import { boardColumns, boardMove, columnStep } from './board-moves';
import { taskOf } from './task-fixture';
import type { TaskRights } from './task-menu';

const worker: TaskRights = { work: true, manage: false, assign: false, review: false };
const reviewer: TaskRights = { work: false, manage: false, assign: false, review: true };

describe('boardMove', () => {
  it('starts a ready task dropped on In progress', () => {
    expect(boardMove(taskOf({ status: 'ready' }), 'in_progress', worker)).toMatchObject({
      kind: 'step',
      step: { key: 'start' },
    });
  });

  it('opens complete when a task in progress is dropped on Done', () => {
    expect(boardMove(taskOf({ status: 'in_progress' }), 'completed', worker)).toMatchObject({
      step: { key: 'complete' },
    });
  });

  it('approves when a reviewer drops a task in review on Done', () => {
    expect(boardMove(taskOf({ status: 'in_review' }), 'completed', reviewer)).toMatchObject({
      step: { key: 'approve' },
    });
  });

  it('sends back when a reviewer drops a task in review on In progress', () => {
    expect(boardMove(taskOf({ status: 'in_review' }), 'in_progress', reviewer)).toMatchObject({
      step: { key: 'sendBack' },
    });
  });

  it('refuses a blocked task', () => {
    expect(
      boardMove(taskOf({ status: 'pending', blockedBy: ['Survey'] }), 'in_progress', worker),
    ).toEqual({ kind: 'denied', reason: 'blocked' });
  });

  it('refuses moving back to not started', () => {
    expect(boardMove(taskOf({ status: 'in_progress' }), 'ready', worker)).toEqual({
      kind: 'denied',
      reason: 'backwards',
    });
  });

  it('refuses someone without rights', () => {
    expect(
      boardMove(taskOf({ status: 'in_progress' }), 'completed', { ...worker, work: false }),
    ).toEqual({ kind: 'denied', reason: 'notAllowed' });
  });

  it('does nothing when dropped on its own column', () => {
    expect(boardMove(taskOf({ status: 'waiting' }), 'waiting', worker)).toEqual({
      kind: 'denied',
      reason: 'same',
    });
  });
});

describe('boardColumns', () => {
  it('puts overdue tasks first in a column', () => {
    const cols = boardColumns([
      taskOf({ id: '1', status: 'ready', dueDate: '2026-11-01' }),
      taskOf({ id: '2', status: 'ready', dueDate: '2026-12-01', overdue: true }),
    ]);
    expect(cols.ready.map((task) => task.id)).toEqual(['2', '1']);
    expect(cols.completed).toEqual([]);
  });
});

describe('columnStep', () => {
  it('moves one column right or left', () => {
    expect(columnStep('in_progress', 'ArrowRight')).toBe('waiting');
    expect(columnStep('in_progress', 'ArrowLeft')).toBe('ready');
  });

  it('stays at the ends and ignores other keys', () => {
    expect(columnStep('completed', 'ArrowRight')).toBe('completed');
    expect(columnStep('pending', 'ArrowLeft')).toBe('pending');
    expect(columnStep('ready', 'ArrowDown')).toBeNull();
  });
});
