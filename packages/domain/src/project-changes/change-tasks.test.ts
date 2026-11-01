import { describe, expect, it } from 'vitest';
import { generateTasks } from '../tasks/generate-tasks';
import { DEFAULT_TASK_LIBRARY } from '../tasks/task-library';
import type { ProjectFacts, TaskTemplate } from '../tasks/task-template';
import { type ExistingTask, planTaskChange, readinessAfter } from './change-tasks';

/** A small plan with round numbers, so each date in the examples can be checked by hand. */
const step = (
  key: string,
  durationDays: number,
  dependsOn: string[],
  when?: TaskTemplate['when'],
): TaskTemplate => ({
  key,
  title: key.replace('_', ' '),
  stage: 'installation',
  roleKey: 'installer',
  offsetDays: 0,
  durationDays,
  dependsOn,
  ...(when ? { when } : {}),
  waitingParty: 'internal',
  customerVisible: false,
  notifyCustomer: false,
  approval: false,
  evidence: [],
  captures: [],
});

const library = [
  step('design', 2, []),
  step('battery_buy', 4, ['design'], { battery: true }),
  step('dispatch', 1, ['design', 'battery_buy']),
  step('install', 1, ['dispatch']),
  step('battery_fit', 1, ['install', 'battery_buy'], { battery: true }),
  step('complete', 1, ['install', 'battery_fit']),
  step('subsidy_apply', 2, ['complete'], { subsidy: true }),
];

const facts: ProjectFacts = {
  projectType: 'residential',
  discomCode: 'MSEDCL',
  loan: false,
  battery: false,
  groundMount: false,
  subsidy: true,
  nameChange: false,
};

/** The project as generated on 2 Nov, with design started. */
function project(start: ProjectFacts, started: Record<string, string> = { design: 'in_progress' }) {
  const generated = generateTasks(library, start, '2026-11-02');
  const tasks: ExistingTask[] = generated.map((task) => ({
    id: task.key,
    key: task.key,
    title: task.title,
    status: started[task.key] ?? (task.dependsOn.length ? 'pending' : 'ready'),
    startedAt: started[task.key] && started[task.key] !== 'ready' ? '2026-11-02' : null,
    startDate: task.startDate,
    dueDate: task.dueDate,
    finishedOn: started[task.key] === 'completed' ? task.dueDate : null,
  }));
  const links = generated.flatMap((task) =>
    task.dependsOn.map((key) => ({ taskId: task.key, dependsOnTaskId: key })),
  );
  return { tasks, links };
}

describe('adding a battery', () => {
  const { tasks, links } = project(facts);
  const plan = planTaskChange({
    library,
    before: facts,
    after: { ...facts, battery: true },
    tasks,
    links,
    today: '2026-11-03',
  });

  it('adds the battery tasks, dated after what they wait for', () => {
    // Buying starts when design is due (4 Nov) and takes 4 days; fitting waits for the
    // installation, which itself moves to 9–10 Nov.
    expect(plan.added).toEqual([
      expect.objectContaining({
        key: 'battery_buy',
        startDate: '2026-11-04',
        dueDate: '2026-11-08',
      }),
      expect.objectContaining({
        key: 'battery_fit',
        startDate: '2026-11-10',
        dueDate: '2026-11-11',
      }),
    ]);
    expect(plan.added[0]?.dependentIds).toEqual(['dispatch']);
    expect(plan.removed).toEqual([]);
  });

  it('moves the waiting tasks later and says how far the finish moves', () => {
    const moved = Object.fromEntries(plan.shifts.map((shift) => [shift.id, shift.days]));
    expect(moved).toEqual({ dispatch: 4, install: 4, complete: 5, subsidy_apply: 5 });
    expect(plan.finishBefore).toBe('2026-11-09');
    expect(plan.finishAfter).toBe('2026-11-14');
    expect(plan.finishMoveDays).toBe(5);
  });
});

describe('switching to non-DCR panels (no subsidy)', () => {
  it('takes the untouched subsidy step off and the finish comes 2 days sooner', () => {
    const { tasks, links } = project(facts);
    const plan = planTaskChange({
      library,
      before: facts,
      after: { ...facts, subsidy: false },
      tasks,
      links,
      today: '2026-11-03',
    });
    expect(plan.removed.map((task) => task.key)).toEqual(['subsidy_apply']);
    expect(plan.added).toEqual([]);
    expect(plan.finishMoveDays).toBe(-2);
  });

  it('keeps a subsidy step someone already started, for a person to close', () => {
    const { tasks, links } = project(facts, { design: 'completed', subsidy_apply: 'in_progress' });
    const plan = planTaskChange({
      library,
      before: facts,
      after: { ...facts, subsidy: false },
      tasks,
      links,
      today: '2026-11-03',
    });
    expect(plan.removed).toEqual([]);
    expect(plan.kept.map((task) => task.key)).toEqual(['subsidy_apply']);
    expect(plan.finishMoveDays).toBe(0);
  });
});

describe('removing a battery', () => {
  it('drops the battery tasks; dispatch is ready once design is done', () => {
    const withBattery = { ...facts, battery: true };
    const { tasks, links } = project(withBattery, { design: 'completed' });
    const plan = planTaskChange({
      library,
      before: withBattery,
      after: facts,
      tasks,
      links,
      today: '2026-11-03',
    });
    expect(plan.removed.map((task) => task.key)).toEqual(['battery_buy', 'battery_fit']);
    const gone = new Set(plan.removed.map((task) => task.id));
    const left = tasks.filter((task) => !gone.has(task.id));
    const leftLinks = links.filter((link) => !gone.has(link.dependsOnTaskId));
    expect(readinessAfter(left, leftLinks)).toEqual([{ id: 'dispatch', status: 'ready' }]);
  });
});

describe('the real task library', () => {
  it('adds battery procurement and installation to a live residential project', () => {
    const generated = generateTasks(DEFAULT_TASK_LIBRARY, facts, '2026-11-02');
    const tasks: ExistingTask[] = generated.map((task) => ({
      id: task.key,
      key: task.key,
      title: task.title,
      status: 'pending',
      startedAt: null,
      startDate: task.startDate,
      dueDate: task.dueDate,
      finishedOn: null,
    }));
    const links = generated.flatMap((task) =>
      task.dependsOn.map((key) => ({ taskId: task.key, dependsOnTaskId: key })),
    );
    const plan = planTaskChange({
      library: DEFAULT_TASK_LIBRARY,
      before: facts,
      after: { ...facts, battery: true },
      tasks,
      links,
      today: '2026-11-02',
    });
    expect(plan.added.map((task) => task.key)).toEqual([
      'battery_procurement',
      'battery_installation',
    ]);
    expect(plan.finishMoveDays).toBeGreaterThanOrEqual(0);
  });
});
