import { describe, expect, it } from 'vitest';
import { isRevisitDue, lostLeadProblem, pickLeadOwner } from './lead-rules';

const today = '2026-11-01';

describe('lostLeadProblem', () => {
  it('needs a reason from the list', () => {
    expect(
      lostLeadProblem({ reasonKey: null, reasonText: 'too costly', revisitOn: null, today })?.field,
    ).toBe('lostReasonKey');
    expect(
      lostLeadProblem({ reasonKey: 'weather', reasonText: null, revisitOn: null, today })?.field,
    ).toBe('lostReasonKey');
  });

  it('needs words only for "other"', () => {
    expect(
      lostLeadProblem({ reasonKey: 'other', reasonText: '  ', revisitOn: null, today })?.field,
    ).toBe('lostReason');
    expect(
      lostLeadProblem({ reasonKey: 'price', reasonText: null, revisitOn: null, today }),
    ).toBeNull();
    expect(
      lostLeadProblem({ reasonKey: 'other', reasonText: 'Moved away', revisitOn: null, today }),
    ).toBeNull();
  });

  it('keeps the revisit day in the future', () => {
    expect(
      lostLeadProblem({ reasonKey: 'postponed', reasonText: null, revisitOn: today, today })?.field,
    ).toBe('revisitOn');
    expect(
      lostLeadProblem({
        reasonKey: 'postponed',
        reasonText: null,
        revisitOn: '2027-02-01',
        today,
      }),
    ).toBeNull();
  });
});

describe('isRevisitDue', () => {
  it('is due only for lost leads whose day has come', () => {
    expect(isRevisitDue({ stage: 'lost', revisitOn: today }, today)).toBe(true);
    expect(isRevisitDue({ stage: 'lost', revisitOn: '2026-10-01' }, today)).toBe(true);
    expect(isRevisitDue({ stage: 'lost', revisitOn: '2026-12-01' }, today)).toBe(false);
    expect(isRevisitDue({ stage: 'lost', revisitOn: null }, today)).toBe(false);
    expect(isRevisitDue({ stage: 'contacted', revisitOn: today }, today)).toBe(false);
  });
});

describe('pickLeadOwner', () => {
  const person = (userId: string, name: string, openLeads: number, onLeave = false) => ({
    userId,
    name,
    openLeads,
    onLeave,
  });

  it('gives the lead to the person with the fewest open leads', () => {
    expect(pickLeadOwner([person('a', 'Asha', 4), person('b', 'Priya', 1)])).toBe('b');
  });

  it('puts people on leave last and breaks ties by name', () => {
    expect(pickLeadOwner([person('a', 'Asha', 0, true), person('b', 'Priya', 3)])).toBe('b');
    expect(pickLeadOwner([person('z', 'Vikas', 2), person('y', 'Anil', 2)])).toBe('y');
  });

  it('is null when nobody can take leads', () => {
    expect(pickLeadOwner([])).toBeNull();
  });
});
