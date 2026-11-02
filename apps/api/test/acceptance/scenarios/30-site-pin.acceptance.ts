import type { Property, TaskSite } from '@oneohm/api-contracts';
import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { taskByKey } from '../support/tasks';
import { inLocationHours } from '../support/travel';

// Google Maps part 1, design 6.2: the crew pins the roof on a map. A pin within 100 m of
// where the worker stood at check-in is trusted; farther, or with no reading, it is still
// saved and flagged for the office, who can confirm it or put back the earlier point.
const P = { latitude: 16.8524, longitude: 74.5815 };
const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;
const north = (metres: number) => ({
  latitude: P.latitude + metres / METRES_PER_DEGREE,
  longitude: P.longitude,
});
const near = (value: number | null | undefined, expected: number) =>
  value !== null && value !== undefined && Math.abs(value - expected) <= 1;
const samePoint = (
  row: { latitude: number | null; longitude: number | null },
  point: { latitude: number; longitude: number },
) =>
  Math.abs((row.latitude ?? 0) - point.latitude) < 1e-7 &&
  Math.abs((row.longitude ?? 0) - point.longitude) < 1e-7;

interface PropertyRow {
  latitude: number | null;
  longitude: number | null;
  previous_latitude: number | null;
  previous_longitude: number | null;
}

describe('Site pin', () => {
  let admin: Session;
  let sale: Sale;
  let sharer: OwnPerson;
  let quiet: OwnPerson;
  let crew: Session;
  let crewOff: Session;
  let surveyId: string;
  let installId: string;

  const propertyId = () => sale.customer.propertyId;
  const property = () => admin.get<Property>(`/properties/${propertyId()}`);
  const stored = async () =>
    (
      await rows<PropertyRow>(
        'select latitude, longitude, previous_latitude, previous_longitude from properties where id = $1',
        [propertyId()],
      )
    )[0] as PropertyRow;
  const located = async () =>
    (
      await rows<{ count: string }>(
        "select count(*) from audit_log where action = 'property.located' and entity_id = $1",
        [propertyId()],
      )
    )[0]?.count;
  const pin = (who: Session, taskId: string, point: { latitude: number; longitude: number }) =>
    who.post<TaskSite>(`/tasks/${taskId}/site/location`, { pin: point });

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Site Pin Customer (test)' });
    surveyId = taskByKey(sale.project, 'site_survey').id;
    installId = taskByKey(sale.project, 'installation_complete').id;
    sharer = await ownPerson(admin, 'Pin Sharer (test)');
    quiet = await ownPerson(admin, 'Pin Quiet (test)');
    await admin.post(`/tasks/${surveyId}/assign`, { userId: sharer.id });
    await admin.post(`/tasks/${installId}/assign`, { userId: quiet.id });
    crew = await Session.code(sharer.phone);
    crewOff = await Session.code(quiet.phone);
    await crew.post('/attendance/consent', { given: true, version: LOCATION_CONSENT_VERSION });
  });
  afterAll(async () => {
    await retire(admin, [sharer, quiet].filter(Boolean));
    await closeDb();
  });

  it('puts back nothing when there is no earlier point', async () => {
    const reply = await admin.raw<{ code: string }>(
      'POST',
      `/properties/${propertyId()}/location/restore`,
      {},
    );
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe('no_previous');
  });

  it('marks a location typed on the web as typed', async () => {
    const saved = await admin.patch<Property>(`/properties/${propertyId()}`, P);
    expect(saved.locationSource).toBe('typed');
    expect(saved.locationFlagged).toBe(false);
  });

  it('trusts a pin 67 m from where the worker stood and re-measures the visit', async () => {
    await inLocationHours(admin, () =>
      crew.post(`/tasks/${surveyId}/site/check-in`, { position: { ...P, accuracyM: 12 } }),
    );
    const site = await pin(crew, surveyId, north(67));
    expect(site.siteFlagged).toBe(false);
    expect(site.canPinSite).toBe(true);
    expect(near(site.openVisit?.checkInDistanceM, 67)).toBe(true);
    const saved = await property();
    expect(saved.locationSource).toBe('map_pin');
    expect(saved.locationFlagged).toBe(false);
    expect(samePoint(saved, north(67))).toBe(true);
  });

  it('saves a pin 245 m away but flags it, keeping the earlier point', async () => {
    await pin(crew, surveyId, north(245));
    const saved = await property();
    expect(saved.locationFlagged).toBe(true);
    expect(near(saved.locationFlagDistanceM, 245)).toBe(true);
    expect(saved.hasPreviousLocation).toBe(true);
    const row = await stored();
    expect(
      samePoint({ latitude: row.previous_latitude, longitude: row.previous_longitude }, north(67)),
    ).toBe(true);
  });

  it('treats the same pin sent twice as one', async () => {
    const before = await located();
    const again = await pin(crew, surveyId, north(245));
    expect(again.siteFlagged).toBe(true);
    expect(await located()).toBe(before);
    const row = await stored();
    expect(samePoint(row, north(245))).toBe(true);
    expect(
      samePoint({ latitude: row.previous_latitude, longitude: row.previous_longitude }, north(67)),
    ).toBe(true);
  });

  it('saves a pin with no location reading and flags it with no distance', async () => {
    await crewOff.post(`/tasks/${installId}/site/check-in`, {});
    await pin(crewOff, installId, north(150));
    const saved = await property();
    expect(samePoint(saved, north(150))).toBe(true);
    expect(saved.locationFlagged).toBe(true);
    expect(saved.locationFlagDistanceM).toBeNull();
  });

  it('lets the office confirm a flagged pin', async () => {
    const confirmed = await admin.post<Property>(`/properties/${propertyId()}/location/confirm`);
    expect(confirmed.locationFlagged).toBe(false);
    expect(samePoint(confirmed, north(150))).toBe(true);
  });

  it('lets the office put back the earlier point, and swap again', async () => {
    const back = await admin.post<Property>(`/properties/${propertyId()}/location/restore`);
    expect(samePoint(back, north(245))).toBe(true);
    expect(back.locationFlagged).toBe(false);
    const swapped = await admin.post<Property>(`/properties/${propertyId()}/location/restore`);
    expect(samePoint(swapped, north(150))).toBe(true);
    expect(swapped.locationFlagged).toBe(false);
  });

  it('asks the worker to check in before pinning', async () => {
    await inLocationHours(admin, () =>
      crew.post(`/tasks/${surveyId}/site/check-out`, { position: { ...P, accuracyM: 12 } }),
    );
    const reply = await crew.raw<{ message: string }>('POST', `/tasks/${surveyId}/site/location`, {
      pin: north(20),
    });
    expect(reply.status).toBe(400);
    expect(reply.body.message).toBe('Check in at this site first.');
  });

  it('never lets an old client replace a pinned location with a reading', async () => {
    const reply = await crewOff.raw<{ code: string }>('POST', `/tasks/${installId}/site/location`);
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe('site_located');
  });

  it('lets the office move the pin on the web, clearing the flag', async () => {
    await pin(crewOff, installId, north(300));
    expect((await property()).locationFlagged).toBe(true);
    const moved = await admin.patch<Property>(`/properties/${propertyId()}`, {
      ...north(10),
      locationSource: 'map_pin',
    });
    expect(moved.locationSource).toBe('map_pin');
    expect(moved.locationFlagged).toBe(false);
    expect(moved.locationFlagDistanceM).toBeNull();
    const row = await stored();
    expect(
      samePoint({ latitude: row.previous_latitude, longitude: row.previous_longitude }, north(300)),
    ).toBe(true);
  });
});
