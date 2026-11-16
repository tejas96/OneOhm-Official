import { describe, expect, it } from 'vitest';
import { alertRoute } from './alert-route';

describe('alertRoute', () => {
  it('opens the subject when there is one', () => {
    expect(alertRoute({ type: 'task', id: 't1' })).toEqual({
      pathname: '/tasks/[id]',
      params: { id: 't1' },
    });
    expect(alertRoute({ type: 'points' }, 'bonus_proposed')).toBe('/rewards');
  });

  it('opens Leave for cover and leave notices', () => {
    for (const kind of [
      'leave_cover_asked',
      'leave_cover_answered',
      'leave_cover_dropped',
      'leave_cover_cancelled',
      'leave_cancelled',
    ]) {
      expect(alertRoute({ type: 'leave', id: 'l1' }, kind)).toBe('/leave');
    }
  });

  it('opens Travel when the travel was decided, voided or paid', () => {
    for (const kind of ['travel_claim_decided', 'travel_claim_voided', 'travel_claim_paid']) {
      expect(alertRoute({ type: 'travel_claim', id: 'c1' }, kind)).toBe('/travel');
    }
  });

  it('opens My month for month sheet notices', () => {
    expect(alertRoute({ type: 'month_sheet', id: 'u1' }, 'month_final')).toBe('/month');
    expect(alertRoute({ type: 'month_sheet', id: 'u1', month: '2026-10' }, 'month_final')).toBe(
      '/month?month=2026-10',
    );
  });

  it('opens a set tab for notices with no subject', () => {
    expect(alertRoute({}, 'departure_cover')).toBe('/');
    expect(alertRoute({}, 'payout_details_changed')).toBe('/');
    expect(alertRoute({}, 'something_else')).toBe('/');
  });
});
