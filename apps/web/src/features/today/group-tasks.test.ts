import { describe, expect, it } from 'vitest';
import { taskOf } from '../projects/tasks/task-fixture';
import { groupTasks } from './group-tasks';

const today = '2026-11-02';

describe('groupTasks', () => {
  it('orders the overdue group by the do-next rule', () => {
    const groups = groupTasks(
      [
        taskOf({ id: 'plain', overdue: true, dueDate: '2026-10-20' }),
        taskOf({ id: 'urgent', overdue: true, dueDate: '2026-10-30', priority: 'urgent' }),
      ],
      today,
    );
    expect(groups.overdue.map((task) => task.id)).toEqual(['urgent', 'plain']);
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
