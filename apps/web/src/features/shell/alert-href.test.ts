import { describe, expect, it } from 'vitest';
import { hrefOf } from './alert-href';

describe('hrefOf', () => {
  it('opens a set page for notices with no subject', () => {
    expect(hrefOf({ subject: null, kind: 'departure_cover' })).toBe('/today');
    expect(hrefOf({ subject: null, kind: 'payout_details_changed' })).toBe('/finance?tab=payouts');
    expect(hrefOf({ subject: null, kind: 'something_else' })).toBe('/');
  });

  it('opens the subject when there is one', () => {
    expect(
      hrefOf({ subject: { type: 'lead', id: 'l1', projectId: null }, kind: 'lead_assigned' }),
    ).toBe('/leads/l1');
  });
});
