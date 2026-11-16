import type { TravelClaim } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { dutyDayKit } from '../support/duty-day';
import { Session } from '../support/http';
import { retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';

// Travel is paid from where duty starts, home or office. A start near the person's base or an
// office is a known place; otherwise the day waits for a person (far_from_base when a base is
// saved, start_unknown_place when none is). The commute is taken off the paid km once a day.
describe('Duty Day: where the day starts and the commute', () => {
  let admin: Session;
  let sale: Sale;
  const kit = dutyDayKit(
    () => admin,
    () => sale,
  );
  const { workDay, putTravel } = kit;
  const reasonsOf = async (me: Session) =>
    ((await me.get<TravelClaim[]>('/me/travel-claims'))[0] as TravelClaim).reviewReasons;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Duty Start Customer (test)' });
    await kit.startPolicy();
  });
  afterAll(async () => {
    await kit.restorePolicy();
    await retire(admin, kit.people);
    await closeDb();
  });

  it('1: a start at the saved base is a known place and the straight line starts there', async () => {
    const { me, day } = await workDay('Duty Home Worker (test)', {});
    expect(day.straightM).toBeGreaterThan(0);
    expect(day.commuteDeductM).toBe(0);
    expect(await reasonsOf(me)).toEqual([]);
  });

  it('2: a base 20 km from the start and from every office is far_from_base', async () => {
    const away = { latitude: 16.85 + 0.18, longitude: 74.58 };
    const { me } = await workDay('Duty Far Base Worker (test)', {}, true, true, away);
    expect(await reasonsOf(me)).toEqual(['far_from_base', 'end_unknown_place']);
  });

  it('3: no base and no office near the start is start_unknown_place', async () => {
    const { me } = await workDay('Duty No Base Worker (test)', {}, true, true, null);
    expect(await reasonsOf(me)).toEqual(['start_unknown_place', 'end_unknown_place']);
  });

  it('4: a start at home and an end more than the limit from home and every office is end_unknown_place', async () => {
    await putTravel({ baseStartMaxKm: 5, autoApprove: true });
    try {
      // The day ends at Miraj, about 7.5 km from the home base at Sangli.
      const { me } = await workDay('Duty Far End Worker (test)', {});
      expect(await reasonsOf(me)).toEqual(['end_unknown_place']);
    } finally {
      await putTravel({ baseStartMaxKm: 10 });
    }
  });

  it('5: the commute is taken off the paid km once, and shown in the claim', async () => {
    await putTravel({ commuteDeductKm: 2 });
    try {
      const { me, day } = await workDay('Duty Commute Worker (test)', {});
      expect(day.commuteDeductM).toBe(2000);
      expect(day.paidM).toBe(day.routeM - 2000);
      const claim = (await me.get<TravelClaim[]>('/me/travel-claims'))[0] as TravelClaim;
      expect(claim).toMatchObject({ commuteDeductM: 2000, paidM: day.paidM });
    } finally {
      await putTravel({ commuteDeductKm: 0 });
    }
  });

  it('6: a day with no site visit pays 0 km whatever the route', async () => {
    const { day } = await workDay('Duty No Visit Worker (test)', {}, true, false);
    expect(day).toMatchObject({ paidM: 0, distanceM: 0 });
  });
});
