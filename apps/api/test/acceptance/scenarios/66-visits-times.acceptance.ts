import type { VisitSettingsRecord, WorkingTimeRecord } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, leadsOf, replies, tap, upToSite, withOnboarding } from '../support/onboarding';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { sellProject, uniquePhone } from '../support/sales';
import { askDay, setVisit, visitsOf, visitTask } from '../support/visits';

// Visits by exact time (docs/specs/2026-11-06-visit-booking.md): the customer picks a day, then a
// time from a list; the pick is booked at once; the business calendar decides which times exist.

const STARTS = [600, 690, 840, 930, 1020]; // 10:00, 11:30, 14:00, 15:30, 17:00
const LUNCH = { start: 780, end: 840 }; // 13:00-14:00

const visitRows = (customerId: string) =>
  rows<{ status: string; start_min: number; end_min: number; day: string }>(
    `SELECT status::text, start_min, end_min, day::text FROM visits
      WHERE customer_id = $1 ORDER BY created_at`,
    [customerId],
  );

describe('Visits: exact times, instant booking, the business calendar', () => {
  let admin: Session;
  let visitor: OwnPerson;
  let before: VisitSettingsRecord;

  beforeAll(async () => {
    admin = await Session.admin();
    visitor = await ownPerson(admin, 'Times Visitor (test)');
    // The default: a customer's tap books the visit at once.
    before = await admin.get<VisitSettingsRecord>('/settings/visits');
    await admin.put('/settings/visits', { ...before, autoConfirmCustomerPicks: true });
  });
  afterAll(async () => {
    await admin.put('/settings/visits', before);
    await retire(admin, [visitor]);
    await closeDb();
  });

  it('a day opens a list of exact free times with Another day; a tap books it confirmed at once', async () => {
    const sale = await sellProject(admin, { name: 'Times Instant (test)' });
    const { customer } = sale;
    const task = await visitTask(sale, 'site_survey', visitor.id);
    const { list } = await askDay(admin, sale, { taskId: task });
    const dayRow = list?.rows?.find((row) => row.id.startsWith('vday:'));
    await tap(customer.phone, dayRow?.id ?? '');

    const times = await lastReply(customer.phone);
    expect(times?.kind).toBe('list');
    expect(times?.buttons).toBeUndefined();
    const timeRows = (times?.rows ?? []).filter((row) => row.id.startsWith('vtime:'));
    // Every row is `vtime:<actionId>:<day>:<startMin>` for a start time from Settings.
    const starts = timeRows.map((row) => Number(row.id.split(':').at(-1)));
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) expect(STARTS).toContain(start);
    expect(timeRows[0]?.id).toMatch(/^vtime:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}:\d+$/);
    expect(times?.rows?.at(-1)?.id).toMatch(/^vask:[0-9a-f-]{36}$/);
    expect(times?.rows?.at(-1)?.title).toBe('Another day');

    await tap(customer.phone, timeRows[0]?.id ?? '');
    const [visit] = await visitRows(customer.customerId);
    expect(visit).toMatchObject({ status: 'confirmed', start_min: starts[0] });
    expect(visit?.end_min).toBe((starts[0] ?? 0) + 90);
    const booked = await lastReply(customer.phone);
    expect(booked?.body).toMatch(/^Booked ✅ \*.+\*\. .+ will call before coming/);
    expect(booked?.buttons?.map((button) => button.title)).toEqual(['Okay', 'Change day']);

    // Staff see it with its exact time, in the day's list, and the time leaves the free times.
    const shown = await visitsOf(admin, { taskId: task });
    expect(shown.visits[0]).toMatchObject({ status: 'confirmed', startMin: starts[0] });
    expect((shown.freeTimes[visit?.day ?? ''] ?? []).map((time) => time.startMin)).not.toContain(
      starts[0],
    );
    const day = visit?.day ?? '';
    const listed = await admin.get<{ id: string }[]>(
      `/visits/list?from=${day}&to=${day}&userId=${visitor.id}`,
    );
    expect(listed.map((row) => row.id)).toContain(shown.visits[0]?.id);
  });

  it('two customers racing for the same time: one wins, the other is told it was just taken and gets the list again', async () => {
    const one = await sellProject(admin, { name: 'Times Race One (test)' });
    const two = await sellProject(admin, { name: 'Times Race Two (test)' });
    const taskOne = await visitTask(one, 'site_survey', visitor.id);
    const taskTwo = await visitTask(two, 'site_survey', visitor.id);
    const askedOne = await askDay(admin, one, { taskId: taskOne });
    const askedTwo = await askDay(admin, two, { taskId: taskTwo });
    // Both are shown the same day and the same times before either taps.
    const day = askedOne.list?.rows?.find((row) => row.id.startsWith('vday:'));
    const sameDay = askedTwo.list?.rows?.find(
      (row) => row.id.split(':').slice(2).join(':') === day?.id.split(':').slice(2).join(':'),
    );
    expect(sameDay).toBeDefined();
    await tap(one.customer.phone, day?.id ?? '');
    await tap(two.customer.phone, sameDay?.id ?? '');
    const timesOne = await lastReply(one.customer.phone);
    const timesTwo = await lastReply(two.customer.phone);
    const startOf = (id: string) => Number(id.split(':').at(-1));
    const shared = (timesOne?.rows ?? [])
      .filter((row) => row.id.startsWith('vtime:'))
      .map((row) => startOf(row.id))
      .find((start) =>
        (timesTwo?.rows ?? []).some(
          (row) => row.id.startsWith('vtime:') && startOf(row.id) === start,
        ),
      );
    expect(shared).toBeDefined();
    const pick = (list: typeof timesOne) =>
      list?.rows?.find((row) => row.id.startsWith('vtime:') && startOf(row.id) === shared)?.id ??
      '';

    await tap(one.customer.phone, pick(timesOne));
    expect((await lastReply(one.customer.phone))?.body).toMatch(/^Booked ✅/);
    const sentBefore = (await replies(two.customer.phone)).length;
    await tap(two.customer.phone, pick(timesTwo));
    const after = (await replies(two.customer.phone)).slice(sentBefore);
    expect(after[0]?.body).toBe('That time was just taken. Please pick again.');
    expect(after[1]?.kind).toBe('list');
    expect(after[1]?.rows?.some((row) => row.id.startsWith('vday:'))).toBe(true);
    // The loser holds no visit; the winner has the time.
    expect(await visitRows(two.customer.customerId)).toEqual([]);
    expect(await visitRows(one.customer.customerId)).toHaveLength(1);
    const [ask] = await rows<{ status: string }>(
      "SELECT status::text FROM customer_actions WHERE customer_id = $1 AND type = 'visit_pick'",
      [two.customer.customerId],
    );
    expect(ask?.status).toBe('open');
  });

  it('a company holiday is not offered, and no time overlaps lunch', async () => {
    const sale = await sellProject(admin, { name: 'Times Calendar (test)' });
    const task = await visitTask(sale, 'site_survey', visitor.id);
    const free = await visitsOf(admin, { taskId: task });
    // Lunch: nothing the staff or the customer can book overlaps 13:00-14:00 or leaves the day.
    for (const times of Object.values(free.freeTimes))
      for (const time of times) {
        expect(time.startMin < LUNCH.end && time.endMin > LUNCH.start).toBe(false);
        expect(time.startMin).toBeGreaterThanOrEqual(570);
        expect(time.endMin).toBeLessThanOrEqual(1110);
      }
    const day = free.freeDays[1] ?? '';
    const lunchTime = await admin.raw('POST', '/visits', {
      taskId: task,
      day,
      slot: 'afternoon',
      startMin: 750, // 12:30-14:00 runs into lunch
    });
    expect(lunchTime.status).toBe(409);

    const hours = await admin.get<WorkingTimeRecord>('/settings/working-time');
    await admin.put('/settings/working-time', {
      ...hours,
      holidays: [...hours.holidays, { day, name: 'Test holiday' }],
    });
    try {
      expect((await visitsOf(admin, { taskId: task })).freeDays).not.toContain(day);
      const { list } = await askDay(admin, sale, { taskId: task });
      const offered = (list?.rows ?? []).filter((row) => row.id.startsWith('vday:'));
      expect(offered.length).toBeGreaterThan(0);
      for (const row of offered) expect(row.id.endsWith(`:${day}`)).toBe(false);
      // A tap on the holiday (an old list) is refused with "just taken" and the days again.
      const actionId = list?.rows?.[0]?.id.split(':')[1] ?? '';
      await tap(sale.customer.phone, `vday:${actionId}:${day}`);
      const sent = await replies(sale.customer.phone);
      expect(sent.at(-2)?.body).toBe('That time was just taken. Please pick again.');
      expect(sent.at(-1)?.kind).toBe('list');
      const refused = await admin.raw('POST', '/visits', {
        taskId: task,
        day,
        slot: 'morning',
        startMin: 600,
      });
      expect(refused.status).toBeGreaterThanOrEqual(400);
    } finally {
      await admin.put('/settings/working-time', hours);
    }
    expect((await visitsOf(admin, { taskId: task })).freeDays).toContain(day);
    // The holiday day is bookable again once removed.
    expect((await setVisit(admin, { taskId: task, day, slot: 'morning' })).status).toBe(
      'confirmed',
    );
  });

  it('[Book a visit] under the estimate books a real visit on the lead: days, then times, confirmed at once, lead Survey scheduled', async () => {
    const restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
    try {
      const phone = uniquePhone();
      await upToSite(phone);
      for (const id of [
        'ob:site:home',
        'ob:bill:2000_3000',
        'ob:roof:rcc',
        'ob:floors:1',
        'ob:photo:later',
      ])
        await tap(phone, id);
      const [lead] = await leadsOf(phone);
      await tap(phone, 'ob:done:visit');
      const days = await lastReply(phone);
      const day = days?.rows?.find((row) => row.id.startsWith('ob:vday:'));
      expect(day).toBeDefined();
      await tap(phone, day?.id ?? '');
      const times = await lastReply(phone);
      const slots = (times?.rows ?? []).filter((row) => row.id.startsWith('ob:vslot:'));
      expect(slots[0]?.id).toMatch(/^ob:vslot:\d{4}-\d{2}-\d{2}:\d+$/);
      expect(times?.buttons).toBeUndefined();
      await tap(phone, slots[0]?.id ?? '');

      const [visit] = await rows<{
        status: string;
        customer_id: string | null;
        kind: string;
        start_min: number;
        end_min: number;
      }>(
        `SELECT status::text, customer_id, kind::text, start_min, end_min
           FROM visits WHERE lead_id = $1`,
        [lead?.id],
      );
      expect(visit).toMatchObject({ status: 'confirmed', customer_id: null, kind: 'survey' });
      expect(visit?.end_min).toBe((visit?.start_min ?? 0) + 90);
      expect(STARTS).toContain(visit?.start_min);
      expect((await lastReply(phone))?.body).toMatch(/^Booked ✅/);
      const [after] = await rows<{ stage: string }>('SELECT stage::text FROM leads WHERE id = $1', [
        lead?.id,
      ]);
      expect(after?.stage).toBe('survey_scheduled');
    } finally {
      await restore();
    }
  });
});
