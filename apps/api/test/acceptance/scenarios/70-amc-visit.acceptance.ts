import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amcEnding, planId } from '../support/amc';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { addDays, sellProject, today } from '../support/sales';
import { closeChat, openChat, templatesFor } from '../support/send';
import { noonOn, openMaintenance, runVisitWorker, templateOn } from '../support/visit-worker';
import { pickDay, setVisit, visitsFor } from '../support/visits';

// An AMC visit due (redesign §4, phase 6): the customer picks a day, the team confirms, the day before
// the customer gets [Confirm] [Change day]; the visit is confirmed on the AMC record.

describe('AMC: the visit', () => {
  let admin: Session;
  let undoPick: () => Promise<void>;
  let undoRemind: () => Promise<void>;
  beforeAll(async () => {
    admin = await Session.admin();
    undoPick = await templateOn('visit_pick');
    undoRemind = await templateOn('visit_reminder');
  });
  afterAll(async () => {
    await undoPick();
    await undoRemind();
    await closeDb();
  });

  it('due -> pick a day -> confirmed on the AMC record -> day-before [Confirm] [Change day]', async () => {
    const sale = await sellProject(admin, { name: 'Amc Visit (test)' });
    const contract = await amcEnding(sale, 300, await planId());
    await rows('INSERT INTO amc_visits (contract_id, position, due_on) VALUES ($1, 1, $2)', [
      contract,
      addDays(today(), 3),
    ]);
    await openMaintenance(today());
    const [ask] = await templatesFor(sale.customer.phone, 'visit_pick');
    expect(ask?.payload.work).toBe('free AMC visit');
    await openChat(sale.customer.phone, sale.customer.customerId);
    await tap(sale.customer.phone, String(ask?.payload.pickPayload));
    // A day late in the list: other scenarios book the first free days of the same crew.
    const list = await lastReply(sale.customer.phone);
    const last = list?.rows?.filter((row) => row.id.startsWith('vday:')).at(-1);
    const picked = await pickDay(sale.customer.phone, {
      ...list,
      rows: last ? [last] : [],
    } as never);
    const [proposed] = await visitsFor(sale.customer.customerId);
    expect(proposed).toMatchObject({ kind: 'amc', status: 'proposed' });

    const [amcVisit] = await rows<{ request: string }>(
      'SELECT service_request_id AS request FROM amc_visits WHERE contract_id = $1',
      [contract],
    );
    const confirmed = await setVisit(admin, {
      serviceRequestId: amcVisit?.request ?? '',
      day: picked.day,
      slot: picked.slot,
    });
    expect(confirmed).toMatchObject({ kind: 'amc', status: 'confirmed' });
    const [mirror] = await rows<{ visit_on: string }>(
      'SELECT visit_on::text FROM service_requests WHERE id = $1',
      [amcVisit?.request],
    );
    expect(mirror?.visit_on).toBe(picked.day);

    // The working day before, at noon: the reminder with its two buttons (the chat is closed).
    // A visit booked on the reminder day itself already told the customer "tomorrow": book it earlier.
    await rows(
      "UPDATE visits SET confirmed_at = confirmed_at - interval '3 days', created_at = created_at - interval '3 days' WHERE customer_id = $1",
      [sale.customer.customerId],
    );
    await closeChat(sale.customer.phone);
    const before = addDays(picked.day, -1);
    const reminderDay =
      new Date(`${before}T00:00:00Z`).getUTCDay() === 0 ? addDays(before, -1) : before;
    await runVisitWorker(noonOn(reminderDay));
    const [reminder] = await templatesFor(sale.customer.phone, 'visit_reminder');
    expect(reminder?.payload).toMatchObject({
      work: 'free AMC visit',
      confirmPayload: expect.stringMatching(/^vcf:/),
      changePayload: expect.stringMatching(/^vchg:/),
    });
    await openChat(sale.customer.phone, sale.customer.customerId);
    await tap(sale.customer.phone, String(reminder?.payload.confirmPayload));
    expect((await visitsFor(sale.customer.customerId))[0]?.customer_confirmed_at).not.toBeNull();
  });
});
