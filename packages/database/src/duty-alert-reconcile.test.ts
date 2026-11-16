import { causeGone } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { type AlertFacts, causeOf, type OpenAlert } from './duty-alert-reconcile';

const facts: AlertFacts = {
  checkedIn: new Set(['ravi:2026-11-16']),
  away: new Map([['2026-11-16', new Set(['asha'])]]),
  visits: new Map([
    ['v-open', { closed: false, proof: null }],
    ['v-closed', { closed: true, proof: 'verified' }],
  ]),
  arrived: new Set(['task-1:2026-11-16']),
  planned: new Map([['pv-2', { status: 'cancelled', day: '2026-11-16', startMin: 600 }]]),
  claims: new Map([
    ['c-pending', { status: 'pending', paid: false }],
    ['c-paid', { status: 'approved', paid: true }],
  ]),
};
const now = { today: '2026-11-16', nowMin: 700 };
const alert = (over: Partial<OpenAlert> & Pick<OpenAlert, 'kind'>): OpenAlert => ({
  id: 'a1',
  personId: 'ravi',
  subjectId: 'ravi',
  day: '2026-11-16',
  detail: {},
  ...over,
});
const gone = (one: OpenAlert) => causeGone(causeOf(one, facts, now));

describe('reconcile: the cause as it stands now', () => {
  it('closes not checked in on a check-in or leave, not otherwise', () => {
    expect(gone(alert({ kind: 'not_checked_in' }))).toBe(true);
    expect(gone(alert({ kind: 'not_checked_in', personId: 'asha', subjectId: 'asha' }))).toBe(true);
    expect(gone(alert({ kind: 'not_checked_in', personId: 'om', subjectId: 'om' }))).toBe(false);
  });

  it('closes a long visit once closed, and a doubtful one once verified', () => {
    expect(gone(alert({ kind: 'visit_open_long', subjectId: 'v-open' }))).toBe(false);
    expect(gone(alert({ kind: 'visit_open_long', subjectId: 'v-closed' }))).toBe(true);
    expect(gone(alert({ kind: 'visit_doubtful', subjectId: 'v-closed' }))).toBe(true);
    expect(gone(alert({ kind: 'visit_doubtful', subjectId: 'v-open' }))).toBe(false);
  });

  it('closes a missed visit when someone checked in at the work, or the visit is cancelled or gone', () => {
    expect(
      gone(alert({ kind: 'visit_missed', subjectId: 'task-1', detail: { visitId: 'x' } })),
    ).toBe(true);
    expect(
      gone(alert({ kind: 'visit_missed', subjectId: 'task-2', detail: { visitId: 'pv-2' } })),
    ).toBe(true);
    expect(gone(alert({ kind: 'visit_missed', subjectId: 'task-3', detail: {} }))).toBe(true);
  });

  it('closes claims once decided or paid', () => {
    expect(gone(alert({ kind: 'claim_waiting', subjectId: 'c-pending' }))).toBe(false);
    expect(gone(alert({ kind: 'claim_waiting', subjectId: 'c-paid' }))).toBe(true);
    expect(gone(alert({ kind: 'claim_unpaid', subjectId: 'c-paid' }))).toBe(true);
    expect(gone(alert({ kind: 'claim_unpaid', subjectId: 'c-pending' }))).toBe(true);
  });
});
