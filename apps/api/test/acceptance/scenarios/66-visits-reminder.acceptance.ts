import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { addDays, sellProject } from '../support/sales';
import { closeChat, openChat, templatesFor } from '../support/send';
import { eveningOn, morningOn, noonOn, runVisitWorker, templateOn } from '../support/visit-worker';
import { setVisit, visitsFor, visitsOf, visitTask } from '../support/visits';

// The day-before reminder, the customer's Change day, "not confirmed" and "missed" (redesign §8).

const alertsOf = async (kind: string, name = '') =>
  (await rows<{ title: string }>('SELECT title FROM notifications WHERE kind = $1', [kind])).filter(
    (alert) => alert.title.includes(name),
  );

/** The day before the visit day, as the worker sees it (the previous working day). */
function reminderDay(day: string) {
  const before = addDays(day, -1);
  return new Date(`${before}T00:00:00Z`).getUTCDay() === 0 ? addDays(before, -1) : before;
}

describe('Visits: reminder, change day, not confirmed, missed', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  beforeAll(async () => {
    admin = await Session.admin();
    restore = await templateOn('visit_reminder');
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('reminds the working day before, once; Confirm is logged; Change day goes back to the list and alerts the owner', async () => {
    const sale = await sellProject(admin, { name: 'Visit Remind (test)' });
    const { customer } = sale;
    const task = await visitTask(sale, 'structure_installation');
    const day = (await visitsOf(admin, { taskId: task })).freeDays[3] ?? '';
    const visit = await setVisit(admin, { taskId: task, day, slot: 'morning' });
    await closeChat(customer.phone);

    // Not yet: two working days before.
    await runVisitWorker(noonOn(addDays(reminderDay(day), -1)));
    expect(await templatesFor(customer.phone, 'visit_reminder')).toHaveLength(0);
    // Outside working hours (19:30) nothing goes.
    await runVisitWorker(eveningOn(reminderDay(day)));
    expect(await templatesFor(customer.phone, 'visit_reminder')).toHaveLength(0);
    await runVisitWorker(noonOn(reminderDay(day)));
    const [sent] = await templatesFor(customer.phone, 'visit_reminder');
    expect(sent?.payload).toMatchObject({
      home: expect.any(String),
      when: expect.stringMatching(/morning$/),
      work: 'installation',
      confirmPayload: `vcf:${visit.id}`,
      changePayload: `vchg:${visit.id}`,
    });
    // A repeated tick says nothing twice.
    await runVisitWorker(noonOn(reminderDay(day)));
    expect(await templatesFor(customer.phone, 'visit_reminder')).toHaveLength(1);

    await tap(customer.phone, `vcf:${visit.id}`);
    expect((await lastReply(customer.phone))?.body).toBe('Thank you ✅ We will see you then.');
    expect((await visitsFor(customer.customerId))[0]?.customer_confirmed_at).not.toBeNull();
    // Confirmed: nothing to alert on the visit morning.
    await runVisitWorker(morningOn(day));
    expect(await alertsOf('visit_not_confirmed', 'Visit Remind')).toHaveLength(0);

    // The same visit, then Change day: the visit is released and the list comes back.
    const other = await sellProject(admin, { name: 'Visit Change Day (test)' });
    const task2 = await visitTask(other, 'panel_installation');
    const day2 = (await visitsOf(admin, { taskId: task2 })).freeDays[3] ?? '';
    const visit2 = await setVisit(admin, { taskId: task2, day: day2, slot: 'afternoon' });
    await openChat(other.customer.phone, other.customer.customerId);
    await tap(other.customer.phone, `vchg:${visit2.id}`);
    const list = await lastReply(other.customer.phone);
    expect(list?.kind).toBe('list');
    expect(list?.body).toMatch(/^No problem\. When can our team visit/);
    expect((await visitsFor(other.customer.customerId))[0]).toMatchObject({ status: 'cancelled' });
    const [ask] = await rows<{ status: string }>(
      "SELECT status::text FROM customer_actions WHERE customer_id = $1 AND type = 'visit_pick' AND status = 'open'",
      [other.customer.customerId],
    );
    expect(ask).toBeDefined();
    expect((await alertsOf('visit_change_day', 'Visit Change Day')).length).toBeGreaterThan(0);
  });

  it('no reply by the visit morning alerts the owner once; a visit not marked done by evening is missed', async () => {
    const sale = await sellProject(admin, { name: 'Visit Missed (test)' });
    const task = await visitTask(sale, 'inverter_installation');
    const day = (await visitsOf(admin, { taskId: task })).freeDays[3] ?? '';
    const visit = await setVisit(admin, { taskId: task, day, slot: 'morning' });
    await closeChat(sale.customer.phone);
    await runVisitWorker(noonOn(reminderDay(day)));
    await runVisitWorker(morningOn(day));
    expect(await alertsOf('visit_not_confirmed', 'Visit Missed')).toHaveLength(1);
    await runVisitWorker(morningOn(day));
    expect(await alertsOf('visit_not_confirmed', 'Visit Missed')).toHaveLength(1);

    await runVisitWorker(eveningOn(day));
    expect((await visitsFor(sale.customer.customerId))[0]?.status).toBe('missed');
    expect(await alertsOf('visit_missed', 'Visit Missed')).toHaveLength(1);
    // A missed visit is closed: a new day can be booked.
    const free = (await visitsOf(admin, { taskId: task })).freeDays[0] ?? '';
    const again = await setVisit(admin, { taskId: task, day: free, slot: 'morning' });
    expect(again.id).not.toBe(visit.id);
  });
});
