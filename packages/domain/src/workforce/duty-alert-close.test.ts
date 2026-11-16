import { describe, expect, it } from 'vitest';
import { alertDigestTitle, type CauseNow, causeGone, mayReopen } from './duty-alert-close';
import { locationOnAt } from './duty-alert-rules';
import { trackingState } from './tracking-switch';

const at = (hhmm: string) => new Date(`2026-11-16T${hhmm}:00Z`);

describe('mayReopen', () => {
  it('never reopens an open alert, nor for a cause that began before the close', () => {
    expect(mayReopen(null, at('10:00'))).toBe(false);
    expect(mayReopen(at('11:00'), at('10:30'))).toBe(false);
    expect(mayReopen(at('11:00'), at('11:00'))).toBe(false);
  });

  it('reopens for a cause that began after the close', () => {
    expect(mayReopen(at('11:00'), at('11:30'))).toBe(true);
  });
});

describe('causeGone', () => {
  const missed = (over: Partial<Extract<CauseNow, { kind: 'visit_missed' }>> = {}): CauseNow => ({
    kind: 'visit_missed',
    arrived: false,
    planned: { status: 'confirmed', day: '2026-11-16', startMin: 600 },
    alertDay: '2026-11-16',
    today: '2026-11-16',
    nowMin: 660,
    ...over,
  });

  it('not checked in: closes on a check-in or leave for that day', () => {
    expect(causeGone({ kind: 'not_checked_in', checkedIn: false, away: false })).toBe(false);
    expect(causeGone({ kind: 'not_checked_in', checkedIn: true, away: false })).toBe(true);
    expect(causeGone({ kind: 'not_checked_in', checkedIn: false, away: true })).toBe(true);
  });

  it('visit open long: closes once the visit closes', () => {
    expect(causeGone({ kind: 'visit_open_long', visitClosed: false })).toBe(false);
    expect(causeGone({ kind: 'visit_open_long', visitClosed: true })).toBe(true);
  });

  it('visit missed: stays while still missed', () => {
    expect(causeGone(missed())).toBe(false);
  });

  it('visit missed: closes when someone arrives, or the visit is cancelled, done or gone', () => {
    expect(causeGone(missed({ arrived: true }))).toBe(true);
    expect(causeGone(missed({ planned: null }))).toBe(true);
    for (const status of ['cancelled', 'done', 'missed'])
      expect(causeGone(missed({ planned: { status, day: '2026-11-16', startMin: 600 } }))).toBe(
        true,
      );
  });

  it('visit missed: closes when moved to another day or to a later start not yet missed', () => {
    expect(
      causeGone(missed({ planned: { status: 'confirmed', day: '2026-11-17', startMin: 600 } })),
    ).toBe(true);
    expect(
      causeGone(missed({ planned: { status: 'confirmed', day: '2026-11-16', startMin: 650 } })),
    ).toBe(true);
    // An earlier day's alert is not judged by today's clock.
    expect(
      causeGone(
        missed({
          alertDay: '2026-11-15',
          planned: { status: 'confirmed', day: '2026-11-15', startMin: 900 },
        }),
      ),
    ).toBe(false);
  });

  it('claims: waiting closes once decided, withdrawn or voided; unpaid once paid or voided', () => {
    expect(causeGone({ kind: 'claim_waiting', status: 'pending' })).toBe(false);
    for (const status of ['approved', 'rejected', 'cancelled', null])
      expect(causeGone({ kind: 'claim_waiting', status })).toBe(true);
    expect(causeGone({ kind: 'claim_unpaid', status: 'approved', paid: false })).toBe(false);
    expect(causeGone({ kind: 'claim_unpaid', status: 'approved', paid: true })).toBe(true);
    expect(causeGone({ kind: 'claim_unpaid', status: 'cancelled', paid: false })).toBe(true);
  });

  it('visit doubtful: closes once the proof is verified', () => {
    expect(causeGone({ kind: 'visit_doubtful', proof: 'doubtful' })).toBe(false);
    expect(causeGone({ kind: 'visit_doubtful', proof: 'no_proof' })).toBe(false);
    expect(causeGone({ kind: 'visit_doubtful', proof: 'verified' })).toBe(true);
  });
});

describe('alertDigestTitle', () => {
  it('says how many and from when', () => {
    expect(alertDigestTitle(7, true)).toBe('7 field alerts from yesterday still open');
    expect(alertDigestTitle(1, true)).toBe('1 field alert from yesterday still open');
    expect(alertDigestTitle(3, false)).toBe('3 field alerts from the last 2 days still open');
  });
});

describe('locationOnAt', () => {
  it('is off when tracking is off, or consent came only after the silence began', () => {
    expect(locationOnAt(at('10:00'), { on: false, consentedAt: at('08:00') })).toBe(false);
    expect(locationOnAt(at('10:00'), { on: true, consentedAt: at('11:00') })).toBe(false);
    expect(locationOnAt(at('10:00'), { on: true, consentedAt: at('08:00') })).toBe(true);
    expect(locationOnAt(at('10:00'), { on: true, consentedAt: null })).toBe(true);
  });
});

describe('trackingState', () => {
  it('switched off wins, then consent, then hours', () => {
    expect(trackingState({ switchedOn: false, consentGiven: true, inHours: true })).toBe(
      'policy_off',
    );
    expect(trackingState({ switchedOn: true, consentGiven: false, inHours: true })).toBe(
      'no_consent',
    );
    expect(trackingState({ switchedOn: true, consentGiven: true, inHours: false })).toBe(
      'outside_hours',
    );
    expect(trackingState({ switchedOn: true, consentGiven: true, inHours: true })).toBe('on');
  });
});
