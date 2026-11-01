import { describe, expect, it } from 'vitest';
import { generateTasks, pickAssignee } from './generate-tasks';
import { DEFAULT_TASK_LIBRARY } from './task-library';
import type { ProjectFacts } from './task-template';

const residential: ProjectFacts = {
  projectType: 'residential',
  discomCode: 'MSEDCL',
  loan: false,
  battery: false,
  groundMount: false,
  subsidy: true,
  nameChange: false,
};

describe('generateTasks', () => {
  it('builds a residential MSEDCL subsidy project without manual task picking', () => {
    const tasks = generateTasks(DEFAULT_TASK_LIBRARY, residential, '2026-11-02');
    const keys = tasks.map((task) => task.key);
    expect(keys).toContain('discom_application');
    expect(keys).toContain('subsidy_application');
    expect(keys).not.toContain('loan_documents');
    expect(keys).not.toContain('society_documents');
    expect(tasks.length).toBeGreaterThan(20);
  });

  it('adds loan, battery and ground-mount work only when selected', () => {
    const tasks = generateTasks(
      DEFAULT_TASK_LIBRARY,
      { ...residential, loan: true, battery: true, groundMount: true, subsidy: false },
      '2026-11-02',
    );
    const keys = tasks.map((task) => task.key);
    expect(keys).toEqual(
      expect.arrayContaining(['loan_documents', 'battery_installation', 'ground_foundation']),
    );
    expect(keys).not.toContain('dcr_undertaking');
  });

  it('drops dependencies on tasks that do not apply and dates each task after what it waits for', () => {
    const tasks = generateTasks(DEFAULT_TASK_LIBRARY, residential, '2026-11-02');
    const byKey = new Map(tasks.map((task) => [task.key, task]));
    expect(byKey.get('discom_application')?.dependsOn).toEqual(['electricity_details']);
    const design = byKey.get('system_design');
    const survey = byKey.get('site_survey');
    expect(survey?.dueDate).toBe('2026-11-04');
    expect(design && survey && design.startDate >= survey.dueDate).toBe(true);
  });

  it('skips other DISCOMs’ tasks', () => {
    const tasks = generateTasks(
      DEFAULT_TASK_LIBRARY,
      { ...residential, discomCode: 'TATA' },
      '2026-11-02',
    );
    expect(tasks.some((task) => task.key === 'discom_application')).toBe(false);
  });
});

describe('pickAssignee', () => {
  it('picks the least-loaded person in the role who is not on leave', () => {
    const picked = pickAssignee(
      [
        { userId: 'a', roleKeys: ['execution'], openTasks: 2, onLeave: false },
        { userId: 'b', roleKeys: ['execution'], openTasks: 0, onLeave: true },
        { userId: 'c', roleKeys: ['execution', 'sales'], openTasks: 1, onLeave: false },
      ],
      'execution',
    );
    expect(picked?.userId).toBe('c');
    expect(pickAssignee([], 'execution')).toBeNull();
  });
});

describe('pickAssignee with leave', () => {
  const people = [
    {
      userId: 'a',
      roleKeys: ['execution'],
      openTasks: 0,
      onLeave: false,
      away: [{ from: '2026-11-09', to: '2026-11-10' }],
    },
    { userId: 'b', roleKeys: ['execution'], openTasks: 3, onLeave: false },
  ];

  it('skips someone on approved leave during the task', () => {
    expect(
      pickAssignee(people, 'execution', { from: '2026-11-08', to: '2026-11-09' })?.userId,
    ).toBe('b');
  });

  it('picks them again when the task is outside their leave', () => {
    expect(
      pickAssignee(people, 'execution', { from: '2026-11-11', to: '2026-11-12' })?.userId,
    ).toBe('a');
  });
});

describe('pickAssignee with a skill (PRD 3.7)', () => {
  const people = [
    { userId: 'a', roleKeys: ['execution'], openTasks: 0, onLeave: false, skills: [] },
    { userId: 'b', roleKeys: ['execution'], openTasks: 4, onLeave: false, skills: ['electrical'] },
    { userId: 'c', roleKeys: ['sales'], openTasks: 0, onLeave: false, skills: ['electrical'] },
  ];

  it('prefers someone in the role who holds the skill, even if busier', () => {
    expect(pickAssignee(people, 'execution', undefined, 'electrical')?.userId).toBe('b');
  });

  it('falls back to the least-loaded person in the role when nobody has it', () => {
    expect(pickAssignee(people, 'execution', undefined, 'roof_work')?.userId).toBe('a');
  });

  it('never picks someone outside the role for a skill', () => {
    expect(pickAssignee(people, 'liaisoning', undefined, 'electrical')).toBeNull();
  });
});
