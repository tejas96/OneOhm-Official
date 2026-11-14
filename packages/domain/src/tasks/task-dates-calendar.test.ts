import { describe, expect, it } from 'vitest';
import { calendarFrom, isWorkingDay } from '../calendar/business-calendar';
import { generateTasks } from './generate-tasks';
import { DEFAULT_TASK_LIBRARY } from './task-library';
import { shiftDependents } from './task-schedule';
import type { ProjectFacts } from './task-template';

const facts: ProjectFacts = {
  projectType: 'residential',
  discomCode: 'MSEDCL',
  loan: false,
  battery: false,
  groundMount: false,
  subsidy: true,
  nameChange: false,
};
const cal = calendarFrom({
  timeZone: 'Asia/Kolkata',
  weeklyOff: [0],
  dayStart: '09:30',
  dayEnd: '18:30',
  holidays: ['2026-11-20'],
});

describe('task dates on the business calendar', () => {
  it('never starts or falls due on a Sunday or a holiday', () => {
    // Saturday start: the plain plan has dates on Sundays and on the holiday.
    const tasks = generateTasks(DEFAULT_TASK_LIBRARY, facts, '2026-11-14', cal);
    for (const task of tasks) {
      expect(isWorkingDay(task.startDate, cal), `${task.key} starts ${task.startDate}`).toBe(true);
      expect(isWorkingDay(task.dueDate, cal), `${task.key} due ${task.dueDate}`).toBe(true);
    }
  });

  it('keeps every task after what it waits for, and never earlier than the plain plan', () => {
    const plain = new Map(
      generateTasks(DEFAULT_TASK_LIBRARY, facts, '2026-11-14').map((task) => [task.key, task]),
    );
    const tasks = generateTasks(DEFAULT_TASK_LIBRARY, facts, '2026-11-14', cal);
    const due = new Map(tasks.map((task) => [task.key, task.dueDate]));
    for (const task of tasks) {
      for (const before of task.dependsOn)
        expect(task.startDate >= (due.get(before) ?? '')).toBe(true);
      expect(task.dueDate >= (plain.get(task.key)?.dueDate ?? '')).toBe(true);
    }
  });

  it('without a calendar, keeps the old plain dates', () => {
    const tasks = generateTasks(DEFAULT_TASK_LIBRARY, facts, '2026-11-14');
    expect(tasks.some((task) => !isWorkingDay(task.dueDate, cal))).toBe(true);
  });

  it('moves a late chain onto working days', () => {
    const tasks = [
      { id: 'a', startDate: '2026-11-16', dueDate: '2026-11-17', finishedOn: null },
      { id: 'b', startDate: '2026-11-17', dueDate: '2026-11-19', finishedOn: null },
    ];
    const links = [{ taskId: 'b', dependsOnTaskId: 'a' }];
    // A now ends on the holiday (Fri 20): B starts Sat 21; its due date moves 3 days to
    // Sun 22, a weekly off, so it falls due on Mon 23.
    const [moved] = shiftDependents(tasks, links, { id: 'a', endsOn: '2026-11-20' }, cal);
    expect(moved?.startDate).toBe('2026-11-21');
    expect(moved?.dueDate).toBe('2026-11-23');
  });
});
