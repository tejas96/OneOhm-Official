import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAD_ASSIGNMENT, type LeadAssignmentRules } from '../settings/lead-assignment';
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
  const person = (
    userId: string,
    name: string,
    openLeads: number,
    away = false,
    lastLeadAt: Date | null = null,
  ) => ({ userId, name, openLeads, away, lastLeadAt });
  const least = DEFAULT_LEAD_ASSIGNMENT;
  const robin: LeadAssignmentRules = { ...least, strategy: 'round_robin' };

  it('skips people who are away', () => {
    expect(pickLeadOwner([person('a', 'Asha', 0, true), person('b', 'Priya', 3)], least)).toBe('b');
  });

  it('returns null when everyone is away', () => {
    expect(pickLeadOwner([person('a', 'Asha', 0, true)], least)).toBeNull();
    expect(pickLeadOwner([], least)).toBeNull();
  });

  it('least_busy picks fewest open leads, then name', () => {
    expect(pickLeadOwner([person('a', 'Asha', 4), person('b', 'Priya', 1)], least)).toBe('b');
    expect(pickLeadOwner([person('z', 'Vikas', 2), person('y', 'Anil', 2)], least)).toBe('y');
  });

  it('round_robin picks the person who got a lead longest ago; never-assigned first', () => {
    const a = person('a', 'Asha', 0, false, new Date('2026-11-03T10:00:00Z'));
    const b = person('b', 'Priya', 0, false, new Date('2026-11-03T09:00:00Z'));
    const c = person('c', 'Zoya', 0);
    expect(pickLeadOwner([a, b, c], robin)).toBe('c');
    expect(pickLeadOwner([a, b], robin)).toBe('b');
  });

  const pune: LeadAssignmentRules = {
    ...least,
    cityOwners: [{ userId: 'b', cities: ['Pune'] }],
  };

  it('city owners win for their city, case and space insensitive', () => {
    const people = [person('a', 'Asha', 0), person('b', 'Priya', 5)];
    expect(pickLeadOwner(people, pune, ' pune ')).toBe('b');
    expect(pickLeadOwner(people, pune, 'Mumbai')).toBe('a');
    expect(pickLeadOwner(people, pune, null)).toBe('a');
  });

  it('a city owner who is away falls back to the general rule', () => {
    const people = [person('a', 'Asha', 2), person('b', 'Priya', 0, true)];
    expect(pickLeadOwner(people, pune, 'Pune')).toBe('a');
  });

  it('city owners split their city by the strategy', () => {
    const rules: LeadAssignmentRules = {
      ...least,
      cityOwners: [
        { userId: 'b', cities: ['Pune'] },
        { userId: 'c', cities: ['pune'] },
      ],
    };
    const people = [person('a', 'Asha', 0), person('b', 'Priya', 4), person('c', 'Zoya', 1)];
    expect(pickLeadOwner(people, rules, 'Pune')).toBe('c');
  });
});
