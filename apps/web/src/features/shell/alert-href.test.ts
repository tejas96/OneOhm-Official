import { describe, expect, it } from 'vitest';
import { hrefOf } from './alert-href';

const subject = (type: string, id = 'x1') =>
  ({ type, id, projectId: null }) as Parameters<typeof hrefOf>[0]['subject'];

describe('hrefOf', () => {
  it('opens a set page for notices with no subject', () => {
    expect(hrefOf({ subject: null, kind: 'departure_cover' })).toBe('/today');
    expect(hrefOf({ subject: null, kind: 'payout_details_changed' })).toBe('/finance?tab=payouts');
    expect(hrefOf({ subject: null, kind: 'payout_sync_failing' })).toBe('/finance?tab=payables');
    expect(hrefOf({ subject: null, kind: 'attendance_auto_closed' })).toBe('/team?tab=attendance');
    // An employee's bank details have no vendor or crew page: Finance → Payables opens.
    expect(hrefOf({ subject: null, kind: 'payee_bank_changed' })).toBe('/finance?tab=payables');
    expect(hrefOf({ subject: null, kind: 'job_failed' })).toBe('/settings?tab=automation');
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
    ['travel_claim', 'travel_claim_paid', '/team?tab=travel&claim=x1'],
    ['travel_claim', 'travel_claim_voided', '/team?tab=travel&claim=x1'],
    // Finance is told a travel claim was approved: the alert opens that bill.
    ['payable', 'travel_payable_ready', '/finance?tab=payables&bill=x1'],
    ['payable', 'travel_payable_voided', '/finance?tab=payables&bill=x1'],
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

  it.each([
    'leave_cover_asked',
    'leave_cover_answered',
    'leave_cover_dropped',
    'leave_cover_cancelled',
    'leave_cancelled',
  ])('opens the Leave tab for %s', (kind) => {
    expect(hrefOf({ subject: subject('leave'), kind })).toBe('/team?tab=leave');
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

  it('opens Marketing for marketing alerts', () => {
    expect(hrefOf({ subject: subject('marketing', 'c1'), kind: 'campaign_paused' })).toBe(
      '/marketing?campaign=c1',
    );
    expect(
      hrefOf({
        subject: subject('marketing_connections', '00000000-0000-0000-0000-000000000000'),
        kind: 'connection_broke',
      }),
    ).toBe('/marketing?tab=connections');
    expect(hrefOf({ subject: subject('marketing_reviews', 'r1'), kind: 'review_waiting' })).toBe(
      '/marketing',
    );
  });

  it('opens the live map for every Duty Day alert', () => {
    const task = { type: 'task', id: 't1', projectId: 'p1' } as const;
    const claim = { type: 'travel_claim', id: 'c1', projectId: null } as const;
    // A person's day: the map opens that person's day on the newest alert of the kind.
    for (const kind of [
      'not_checked_in',
      'fake_gps',
      'route_gap',
      'unknown_stop',
      'visit_open_long',
      'job_left_unfinished',
    ])
      expect(hrefOf({ subject: null, kind: `duty_${kind}` })).toBe(`/live?kind=${kind}`);
    // A site: the Alerts tab on that site's alert (Send nearest is one tap away).
    expect(hrefOf({ subject: task, kind: 'duty_visit_missed' })).toBe(
      '/live?kind=visit_missed&site=t1',
    );
    expect(
      hrefOf({
        subject: { type: 'service_request', id: 's1', projectId: null },
        kind: 'duty_visit_doubtful',
      }),
    ).toBe('/live?kind=visit_doubtful&site=s1');
    expect(hrefOf({ subject: null, kind: 'duty_visit_missed' })).toBe('/live?kind=visit_missed');
    // A travel claim opens the claim itself.
    expect(hrefOf({ subject: claim, kind: 'duty_claim_waiting' })).toBe(
      '/team?tab=travel&claim=c1',
    );
    expect(hrefOf({ subject: claim, kind: 'duty_claim_unpaid' })).toBe('/team?tab=travel&claim=c1');
    expect(hrefOf({ subject: null, kind: 'duty_alerts_digest' })).toBe('/live?tab=alerts');
  });
});
