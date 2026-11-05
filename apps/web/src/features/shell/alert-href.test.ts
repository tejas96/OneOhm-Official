import { describe, expect, it } from 'vitest';
import { hrefOf } from './alert-href';

const subject = (type: string, id = 'x1') =>
  ({ type, id, projectId: null }) as Parameters<typeof hrefOf>[0]['subject'];

describe('hrefOf', () => {
  it('opens a set page for notices with no subject', () => {
    expect(hrefOf({ subject: null, kind: 'departure_cover' })).toBe('/today');
    expect(hrefOf({ subject: null, kind: 'payout_details_changed' })).toBe('/finance?tab=payouts');
    expect(hrefOf({ subject: null, kind: 'payout_sync_failing' })).toBe('/finance?tab=payables');
    expect(hrefOf({ subject: null, kind: 'something_else' })).toBe('/');
  });

  it('opens the subject when there is one', () => {
    expect(
      hrefOf({ subject: { type: 'lead', id: 'l1', projectId: null }, kind: 'lead_assigned' }),
    ).toBe('/leads/l1');
  });

  it.each([
    ['leave', 'leave_requested', '/team?tab=leave&leave=x1'],
    ['correction', 'correction_requested', '/team?tab=attendance&correction=x1'],
    ['points', 'bonus_proposed', '/team?tab=bonuses&bonus=x1'],
    ['travel_claim', 'travel_claim', '/team?tab=travel&claim=x1'],
    ['vendor_advance', 'vendor_advance', '/finance?tab=advances&filter=pending&advance=x1'],
    ['payable', 'payout_processed', '/finance?tab=payables&bill=x1'],
    ['payable', 'payout_failed', '/finance?tab=payables&bill=x1'],
    ['payable', 'payout_reversed', '/finance?tab=payables&bill=x1'],
    ['payable', 'payout_stuck', '/finance?tab=payables&bill=x1'],
    ['payable', 'payout_paid_twice', '/finance?tab=payables&bill=x1'],
    ['vendor', 'payee_bank_changed', '/inventory/vendors/x1'],
    ['contractor', 'payee_bank_changed', '/contractors/x1'],
    ['payable', 'payout_unsure', '/finance?tab=payables&bill=x1'],
  ])('opens the %s waiting for a decision itself', (type, kind, href) => {
    expect(hrefOf({ subject: subject(type), kind })).toBe(href);
  });

  it('opens the tab for alerts that tell an outcome', () => {
    expect(hrefOf({ subject: subject('leave'), kind: 'leave_decided' })).toBe('/team?tab=leave');
    expect(hrefOf({ subject: subject('points'), kind: 'bonus_approved' })).toBe(
      '/team?tab=bonuses',
    );
    expect(hrefOf({ subject: subject('points'), kind: 'points_approved' })).toBe(
      '/team?tab=points',
    );
  });
});
