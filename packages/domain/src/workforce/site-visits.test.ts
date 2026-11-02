import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFORCE_POLICY, withPolicyDefaults } from './policy';
import {
  consentIsCurrent,
  inLocationWindow,
  LOCATION_CONSENT_VERSION,
  locationCutoff,
  locationExpired,
  siteDistance,
  siteVisitKindOf,
} from './site-visits';
import {
  orderStops,
  type TravelStop,
  travelAmountPaise,
  travelDistanceM,
  travelLegs,
} from './travel';

// A rooftop in Vishrambag, Sangli, and points around it.
const site = { latitude: 16.8524, longitude: 74.5815 };
const fortyMetresNorth = { latitude: 16.85276, longitude: 74.5815 };
const halfKmEast = { latitude: 16.8524, longitude: 74.5862 };

describe('site visit kinds', () => {
  it('knows the site tasks by template', () => {
    expect(siteVisitKindOf({ templateKey: 'site_survey', stage: 'survey' })).toBe('survey');
    expect(siteVisitKindOf({ templateKey: 'panel_installation', stage: 'installation' })).toBe(
      'installation',
    );
    expect(siteVisitKindOf({ templateKey: 'handover', stage: 'net_metering' })).toBe('inspection');
  });

  it('treats office work as no site visit, and new installation templates as one', () => {
    expect(siteVisitKindOf({ templateKey: 'loan_documents', stage: 'design' })).toBeNull();
    expect(siteVisitKindOf({ templateKey: 'electricity_details', stage: 'survey' })).toBeNull();
    expect(siteVisitKindOf({ templateKey: 'cable_tray', stage: 'installation' })).toBe(
      'installation',
    );
  });
});

describe('distance from the site', () => {
  it('measures a check-in 40 m away as at the site', () => {
    const result = siteDistance({ ...fortyMetresNorth, accuracyM: 12 }, site, 300);
    expect(result?.distanceM).toBe(40);
    expect(result?.far).toBe(false);
  });

  it('flags a check-in farther than the radius instead of refusing it', () => {
    const result = siteDistance({ ...halfKmEast, accuracyM: 10 }, site, 300);
    expect(result?.distanceM).toBe(500);
    expect(result?.far).toBe(true);
  });

  it('allows for a weak fix, but never more than 100 m of it', () => {
    expect(siteDistance({ ...halfKmEast, accuracyM: 250 }, site, 450)?.far).toBe(false);
    expect(siteDistance({ ...halfKmEast, accuracyM: 900 }, site, 300)?.far).toBe(true);
  });

  it('knows nothing when the site has no saved location', () => {
    expect(siteDistance(fortyMetresNorth, null, 300)).toBeNull();
  });
});

describe('consent and working hours', () => {
  const at = new Date('2026-11-01T04:00:00Z');

  it('counts consent only for the current words, and never once withdrawn', () => {
    const given = { consentedAt: at, withdrawnAt: null, textVersion: LOCATION_CONSENT_VERSION };
    expect(consentIsCurrent(given)).toBe(true);
    expect(consentIsCurrent({ ...given, textVersion: 1 })).toBe(false);
    expect(consentIsCurrent({ ...given, textVersion: null })).toBe(false);
    expect(consentIsCurrent({ ...given, withdrawnAt: at })).toBe(false);
    expect(consentIsCurrent(null)).toBe(false);
  });

  it('reads location only in working hours plus the margin', () => {
    const hours = { dayStart: '09:30', dayEnd: '18:30' };
    expect(inLocationWindow('08:30', hours, 60)).toBe(true);
    expect(inLocationWindow('08:29', hours, 60)).toBe(false);
    expect(inLocationWindow('19:30', hours, 60)).toBe(true);
    expect(inLocationWindow('19:31', hours, 60)).toBe(false);
    expect(inLocationWindow('09:00', hours, 0)).toBe(false);
  });
});

describe('travel and reimbursement', () => {
  const stop = (id: string, kind: TravelStop['kind'], at: string, point: TravelStop['point']) => ({
    id,
    kind,
    label: id,
    at,
    point,
  });

  it('builds legs in time order with the start first and the end last', () => {
    const ordered = orderStops([
      stop('end', 'end', '2026-11-02T12:00:00Z', site),
      stop('b', 'visit', '2026-11-02T08:00:00Z', halfKmEast),
      stop('a', 'visit', '2026-11-02T06:00:00Z', fortyMetresNorth),
      stop('start', 'start', '2026-11-02T04:00:00Z', site),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['start', 'a', 'b', 'end']);
    const legs = travelLegs(ordered);
    expect(legs.map((leg) => leg.distanceM)).toEqual([40, 502, 500]);
    expect(travelDistanceM(legs)).toBe(1042);
  });

  it('shows a leg without a location but pays nothing for it', () => {
    const legs = travelLegs([
      stop('a', 'visit', '2026-11-02T06:00:00Z', site),
      stop('b', 'visit', '2026-11-02T07:00:00Z', null),
      stop('c', 'visit', '2026-11-02T08:00:00Z', halfKmEast),
    ]);
    expect(legs.map((leg) => leg.distanceM)).toEqual([null, null]);
    expect(travelDistanceM(legs)).toBe(0);
  });

  it('pays the rate per km on the metres, to the nearest paisa', () => {
    // 12.345 km at ₹5/km is ₹61.73.
    expect(travelAmountPaise(12_345, 500)).toBe(6173);
    expect(travelAmountPaise(0, 500)).toBe(0);
    expect(travelAmountPaise(5_000, 0)).toBe(0);
  });
});

describe('location retention', () => {
  it('clears coordinates older than the retention period and keeps the last day of it', () => {
    expect(locationCutoff('2026-11-01', 90)).toBe('2026-08-03');
    expect(locationExpired('2026-08-02', '2026-11-01', 90)).toBe(true);
    expect(locationExpired('2026-08-03', '2026-11-01', 90)).toBe(false);
    expect(locationExpired('2026-10-31', '2026-11-01', 7)).toBe(false);
  });
});

describe('workforce policy defaults', () => {
  it('fills the travel rules into a policy saved before they existed', () => {
    const { travel: _travel, ...older } = DEFAULT_WORKFORCE_POLICY;
    const filled = withPolicyDefaults({ ...older, attendance: { ...older.attendance } });
    expect(filled.travel).toEqual({
      farFromSiteM: 300,
      ratePaisePerKm: 500,
      hoursMarginMinutes: 60,
      pinTrustM: 100,
    });
  });
});
