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

  it('opens a set tab for notices with no subject', () => {
    expect(alertRoute({}, 'departure_cover')).toBe('/');
    expect(alertRoute({}, 'payout_details_changed')).toBe('/');
    expect(alertRoute({}, 'something_else')).toBe('/');
  });
});
