import { describe, expect, it } from 'vitest';
import { type DayFacts, reviewTravelDay } from './travel-review';

const rules = { autoApprove: true, autoApproveMaxKm: 150, autoApproveMaxPaise: 150_000 };
const clean: DayFacts = {
  method: 'route',
  gapMinutes: 0,
  mockedCount: 0,
  capApplied: false,
  farCheckIns: 0,
  unlocatedVisits: 0,
  autoClosed: false,
  delayedTap: false,
  paidM: 18_400,
  amountPaise: 9_200,
  onLeave: false,
};
const review = (over: Partial<DayFacts> = {}, r = rules) =>
  reviewTravelDay({ ...clean, ...over }, r);

describe('reviewTravelDay', () => {
  it('approves a clean day', () => {
    expect(review()).toEqual({ approve: true, reasons: [] });
  });

  it('allows a gap of 30 minutes, not 31', () => {
    expect(review({ gapMinutes: 30 }).approve).toBe(true);
    expect(review({ gapMinutes: 31 }).reasons).toEqual(['route_gap']);
  });

  it.each([
    ['fake_gps', { mockedCount: 1 }],
    ['cap_applied', { capApplied: true }],
    ['far_check_in', { farCheckIns: 1 }],
    ['visit_no_location', { unlocatedVisits: 1 }],
    ['auto_closed', { autoClosed: true }],
    ['delayed_tap', { delayedTap: true }],
    ['no_route', { method: 'straight' as const }],
    ['no_visits', { noVisits: true }],
    ['uncapped_route', { uncappedRoute: true }],
    ['short_route', { shortRoute: true }],
    ['far_from_base', { startPlace: 'far_from_base' as const }],
    ['start_unknown_place', { startPlace: 'unknown_place' as const }],
    ['start_unknown', { startPlace: 'missing' as const }],
    ['end_unknown', { endPlace: 'missing' as const }],
    ['end_unknown_place', { endPlace: 'unknown_place' as const }],
    ['end_unknown_place', { endPlace: 'far_from_base' as const }],
    ['on_leave', { onLeave: true }],
  ] as const)('sends the day to a person for %s', (reason, over) => {
    expect(review(over)).toEqual({ approve: false, reasons: [reason] });
  });

  it('gives no reason for a start at a known place', () => {
    expect(review({ startPlace: 'known' })).toEqual({ approve: true, reasons: [] });
  });

  it('holds a day over the km limit, not one at it', () => {
    expect(review({ paidM: 150_000 }).approve).toBe(true);
    expect(review({ paidM: 150_001 }).reasons).toEqual(['over_km']);
  });

  it('holds a day over the amount limit, not one at it', () => {
    expect(review({ amountPaise: 150_000 }).approve).toBe(true);
    expect(review({ amountPaise: 150_001 }).reasons).toEqual(['over_amount']);
  });

  it('holds everything when automatic approval is off', () => {
    expect(review({}, { ...rules, autoApprove: false })).toEqual({
      approve: false,
      reasons: ['auto_approve_off'],
    });
  });

  it('lists every reason', () => {
    const out = review({ mockedCount: 2, gapMinutes: 60, onLeave: true });
    expect(out.reasons).toEqual(['route_gap', 'fake_gps', 'on_leave']);
  });
});
