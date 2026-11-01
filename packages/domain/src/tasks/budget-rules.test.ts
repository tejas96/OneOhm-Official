import { describe, expect, it } from 'vitest';
import { budgetHold } from './budget-hold';
import {
  checkEscalationPolicy,
  DEFAULT_ESCALATION,
  earliestEscalationDays,
  lateEscalation,
} from './escalation';
import { generateTasks } from './generate-tasks';
import { DEFAULT_TASK_LIBRARY } from './task-library';
import { SURVEY_TEMPLATE_KEYS } from './task-library-survey';
import type { ProjectFacts } from './task-template';
import { placeNewTemplates } from './template-order';

describe('budgetHold (PRD 3.5, Flow F)', () => {
  it('holds material work until the survey price check locks the budget', () => {
    expect(budgetHold('material', 'awaiting_survey', true)).toBe('awaiting_survey');
    expect(budgetHold('material', 'revision_needed', true)).toBe('revision_needed');
    expect(budgetHold('material', 'locked', true)).toBeNull();
    expect(budgetHold('material', 'revised', true)).toBeNull();
  });

  it('never holds other stages, or a project with no survey task', () => {
    expect(budgetHold('design', 'awaiting_survey', true)).toBeNull();
    expect(budgetHold('material', 'awaiting_survey', false)).toBeNull();
  });
});

describe('lateEscalation (PRD 3.7)', () => {
  it('tells the manager first, then the owners', () => {
    expect(lateEscalation(1, DEFAULT_ESCALATION)).toBeNull();
    expect(lateEscalation(2, DEFAULT_ESCALATION)).toBe('manager');
    expect(lateEscalation(7, DEFAULT_ESCALATION)).toBe('owners');
  });

  it('moves both steps for a template’s own days, keeping the gap', () => {
    expect(lateEscalation(4, DEFAULT_ESCALATION, 5)).toBeNull();
    expect(lateEscalation(5, DEFAULT_ESCALATION, 5)).toBe('manager');
    expect(lateEscalation(10, DEFAULT_ESCALATION, 5)).toBe('owners');
    expect(earliestEscalationDays(DEFAULT_ESCALATION, [5, null, 1])).toBe(1);
  });

  it('rejects an owner step that comes before the manager’s', () => {
    expect(checkEscalationPolicy(DEFAULT_ESCALATION)).toEqual({});
    expect(
      checkEscalationPolicy({ ...DEFAULT_ESCALATION, ownersAfterDays: 2 }).ownersAfterDays,
    ).toBeDefined();
    expect(checkEscalationPolicy({ ...DEFAULT_ESCALATION, stuckInternalDays: 0 })).toHaveProperty(
      'stuckInternalDays',
    );
  });
});

const base: ProjectFacts = {
  projectType: 'residential',
  discomCode: 'MSEDCL',
  loan: false,
  battery: false,
  groundMount: false,
  subsidy: true,
  nameChange: false,
};
const surveysFor = (facts: ProjectFacts) =>
  generateTasks(DEFAULT_TASK_LIBRARY, facts, '2026-11-02')
    .map((task) => task.key)
    .filter((key) => SURVEY_TEMPLATE_KEYS.includes(key));

describe('survey per kind of site (PRD 3.4)', () => {
  it('gives each project exactly one survey, which needs a manager’s approval', () => {
    expect(surveysFor(base)).toEqual(['site_survey']);
    expect(surveysFor({ ...base, projectType: 'society' })).toEqual(['site_survey_society']);
    expect(surveysFor({ ...base, projectType: 'commercial' })).toEqual(['site_survey_commercial']);
    expect(surveysFor({ ...base, projectType: 'commercial', groundMount: true })).toEqual([
      'site_survey_ground',
    ]);
    const surveys = DEFAULT_TASK_LIBRARY.filter((t) => SURVEY_TEMPLATE_KEYS.includes(t.key));
    expect(surveys.every((t) => t.approval && t.captures.includes('dc_cable_meters'))).toBe(true);
  });

  it('adds commercial papers and the Electrical Inspector only to commercial projects', () => {
    const keys = (facts: ProjectFacts) =>
      generateTasks(DEFAULT_TASK_LIBRARY, facts, '2026-11-02').map((task) => task.key);
    const commercial = keys({ ...base, projectType: 'commercial', subsidy: false });
    expect(commercial).toEqual(
      expect.arrayContaining([
        'commercial_documents',
        'structural_stability',
        'electrical_inspection',
      ]),
    );
    expect(keys(base)).not.toContain('electrical_inspection');
  });
});

describe('placeNewTemplates', () => {
  it('puts new library tasks right after their predecessor, keeping the owner’s order', () => {
    const owner = ['site_survey', 'design', 'docs'];
    const library = ['site_survey', 'survey_society', 'survey_ground', 'docs', 'design', 'new_end'];
    expect(placeNewTemplates(owner, library)).toEqual([
      'site_survey',
      'survey_society',
      'survey_ground',
      'design',
      'new_end',
      'docs',
    ]);
    expect(placeNewTemplates([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});
