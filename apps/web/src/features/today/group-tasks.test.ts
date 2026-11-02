import { describe, expect, it } from 'vitest';
import { taskOf } from '../projects/tasks/task-fixture';
import { groupTasks } from './group-tasks';

const today = '2026-11-02';

describe('groupTasks', () => {
  it('orders the overdue group by the do-next rule', () => {
    const groups = groupTasks(
      [
        taskOf({ id: 'plain', overdue: true, dueDate: '2026-10-20' }),
        taskOf({ id: 'high', overdue: true, dueDate: '2026-10-30', priority: 'high' }),
      ],
      today,
    );
    expect(groups.overdue.map((task) => task.id)).toEqual(['high', 'plain']);
  });

  it('keeps the waiting group in due-date order', () => {
    const groups = groupTasks(
      [
        taskOf({ id: 'later', status: 'waiting', dueDate: '2026-11-09', priority: 'urgent' }),
        taskOf({ id: 'sooner', status: 'waiting', dueDate: '2026-11-05' }),
      ],
      today,
    );
    expect(groups.waiting.map((task) => task.id)).toEqual(['sooner', 'later']);
  });
});

describe('do first', () => {
  it('lifts a startable urgent task, or one that blocks an urgent task, above overdue work', () => {
    const groups = groupTasks(
      [
        taskOf({ id: 'late', overdue: true, dueDate: '2026-10-20' }),
        taskOf({ id: 'urgent', dueDate: '2026-11-09', priority: 'urgent' }),
        taskOf({ id: 'unblock', dueDate: '2026-11-12', blocksUrgent: true }),
      ],
      today,
    );
    expect(groups.first.map((task) => task.id)).toEqual(['urgent', 'unblock']);
    expect(groups.overdue.map((task) => task.id)).toEqual(['late']);
  });

  it('leaves blocked or held urgent tasks where they were', () => {
    const groups = groupTasks(
      [
        taskOf({ id: 'blocked', priority: 'urgent', blockedBy: ['Survey'] }),
        taskOf({ id: 'held', priority: 'urgent', status: 'waiting' }),
      ],
      today,
    );
    expect(groups.first).toEqual([]);
  });
});
