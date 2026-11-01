import { describe, expect, it } from 'vitest';
import { type PlannedTask, shiftDependents, slipDays, type TaskLink } from './task-schedule';

const open = (id: string, startDate: string, dueDate: string): PlannedTask => ({
  id,
  startDate,
  dueDate,
  finishedOn: null,
});
const link = (taskId: string, dependsOnTaskId: string): TaskLink => ({ taskId, dependsOnTaskId });

describe('shiftDependents', () => {
  // survey (2–4 Nov) → design (4–6 Nov) → order (6–9 Nov)
  const chain = [
    open('survey', '2026-11-02', '2026-11-04'),
    open('design', '2026-11-04', '2026-11-06'),
    open('order', '2026-11-06', '2026-11-09'),
  ];
  const chainLinks = [link('design', 'survey'), link('order', 'design')];

  it('moves the whole chain later by the slip, keeping each task’s length', () => {
    const shifts = shiftDependents(chain, chainLinks, { id: 'survey', endsOn: '2026-11-07' });
    expect(shifts).toEqual([
      { id: 'design', startDate: '2026-11-07', dueDate: '2026-11-09', days: 3 },
      { id: 'order', startDate: '2026-11-09', dueDate: '2026-11-12', days: 3 },
    ]);
  });

  it('moves nothing when the task ends on or before the day the next one starts', () => {
    expect(shiftDependents(chain, chainLinks, { id: 'survey', endsOn: '2026-11-04' })).toEqual([]);
    expect(shiftDependents(chain, chainLinks, { id: 'survey', endsOn: '2026-11-01' })).toEqual([]);
  });

  it('uses up slack first: a task planned later moves only as far as it must', () => {
    const tasks = [
      open('survey', '2026-11-02', '2026-11-04'),
      open('design', '2026-11-06', '2026-11-08'),
    ];
    const shifts = shiftDependents(tasks, [link('design', 'survey')], {
      id: 'survey',
      endsOn: '2026-11-07',
    });
    expect(shifts).toEqual([
      { id: 'design', startDate: '2026-11-07', dueDate: '2026-11-09', days: 1 },
    ]);
  });

  it('moves a task waiting on two late tasks once, by the larger slip', () => {
    const tasks = [
      open('a', '2026-11-02', '2026-11-04'),
      open('b', '2026-11-02', '2026-11-06'),
      open('c', '2026-11-06', '2026-11-08'),
    ];
    const links = [link('c', 'a'), link('c', 'b')];
    // a ends 5 Nov, but b is still due 6 Nov: c keeps its dates.
    expect(shiftDependents(tasks, links, { id: 'a', endsOn: '2026-11-05' })).toEqual([]);
    // b ends 9 Nov: c moves 3 days, not 3 + a's slip.
    expect(shiftDependents(tasks, links, { id: 'b', endsOn: '2026-11-09' })).toEqual([
      { id: 'c', startDate: '2026-11-09', dueDate: '2026-11-11', days: 3 },
    ]);
  });

  it('never moves finished tasks, and stops the chain at them', () => {
    const tasks = [
      open('survey', '2026-11-02', '2026-11-04'),
      { ...open('design', '2026-11-04', '2026-11-06'), finishedOn: '2026-11-05' },
      open('order', '2026-11-06', '2026-11-09'),
    ];
    expect(shiftDependents(tasks, chainLinks, { id: 'survey', endsOn: '2026-11-10' })).toEqual([]);
  });

  it('follows a manager’s later due date down the chain too', () => {
    const shifts = shiftDependents(chain, chainLinks, { id: 'design', endsOn: '2026-11-08' });
    expect(shifts).toEqual([
      { id: 'order', startDate: '2026-11-08', dueDate: '2026-11-11', days: 2 },
    ]);
  });

  it('ignores an unknown task', () => {
    expect(shiftDependents(chain, chainLinks, { id: 'nope', endsOn: '2026-12-01' })).toEqual([]);
  });
});

describe('slipDays', () => {
  it('counts only lateness', () => {
    expect(slipDays('2026-11-04', '2026-11-07')).toBe(3);
    expect(slipDays('2026-11-04', '2026-11-04')).toBe(0);
    expect(slipDays('2026-11-04', '2026-11-01')).toBe(0);
  });
});
