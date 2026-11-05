import { describe, expect, it } from 'vitest';
import {
  bankDayOk,
  isStepKind,
  loanStatusNews,
  STEP_TASK_KEYS,
  subsidyChaseDue,
} from './step-asks';

describe('step questions', () => {
  it('knows its four kinds and the task each hangs on', () => {
    expect(isStepKind('layout')).toBe(true);
    expect(isStepKind('site_ready')).toBe(false);
    expect(STEP_TASK_KEYS.subsidy_credit).toBe('subsidy_release');
  });

  it('chases a subsidy that has not arrived only after the configured days', () => {
    const said = new Date('2026-11-01T06:00:00Z');
    expect(subsidyChaseDue(said, new Date('2026-11-15T05:59:00Z'), 15)).toBe(false);
    expect(subsidyChaseDue(said, new Date('2026-11-16T06:00:00Z'), 15)).toBe(true);
    expect(subsidyChaseDue(said, new Date('2026-11-04T06:00:00Z'), 3)).toBe(true);
  });

  it('tells the customer only of a loan being sanctioned or rejected, once', () => {
    expect(loanStatusNews('submitted', 'sanctioned')).toBe('sanctioned');
    expect(loanStatusNews('submitted', 'rejected')).toBe('rejected');
    expect(loanStatusNews('sanctioned', 'sanctioned')).toBeNull();
    expect(loanStatusNews('collecting_documents', 'submitted')).toBeNull();
    expect(loanStatusNews(null, 'sanctioned')).toBe('sanctioned');
  });

  it('accepts a bank day that is a real date from today on', () => {
    expect(bankDayOk('2026-11-06', '2026-11-05')).toBe(true);
    expect(bankDayOk('2026-11-05', '2026-11-05')).toBe(true);
    expect(bankDayOk('2026-11-04', '2026-11-05')).toBe(false);
    expect(bankDayOk('6 Nov', '2026-11-05')).toBe(false);
    expect(bankDayOk('2026-13-45', '2026-11-05')).toBe(false);
  });
});
