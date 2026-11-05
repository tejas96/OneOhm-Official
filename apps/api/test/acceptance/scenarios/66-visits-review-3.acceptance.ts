import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { replies } from '../support/onboarding';
import { addDays, sellProject, today } from '../support/sales';
import { openChat } from '../support/send';
import { ensurePerson, STAFF } from '../support/team';
import { askDay, pickDay, setVisit, visitsFor, visitsOf, visitTask } from '../support/visits';

// Fix round 3 for visits: booking and reassigning take turns; announcements; the pick timer.

const told = async (phone: string) =>
  (await replies(phone)).filter((reply) => /^Your visit on \*/.test(reply.body));

describe('Visits: review fixes, round 3', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('booking and reassigning at once take turns, and the crew ends up the new person', async () => {
    const sale = await sellProject(admin, { name: 'Race Assign (test)' });
    const person = await ensurePerson(admin, { ...STAFF.execution });
    const task = await visitTask(sale, 'panel_installation', admin.userId);
    const [day] = (await visitsOf(admin, { taskId: task })).freeDays;
    const results = await Promise.all([
      admin.raw('POST', '/visits', { taskId: task, day: day ?? '', slot: 'morning' }),
      admin.raw('POST', `/tasks/${task}/assign`, { userId: person.id }),
    ]);
    expect(results.map((reply) => reply.status)).toEqual([200, 200]);
    const [visit] = await visitsFor(sale.customer.customerId);
    expect(visit?.crew_user_ids).toEqual([person.id]);
  });

  it('a DISCOM date reassigned does not message the customer; a visit passed A, B, A, B tells each time', async () => {
    const sale = await sellProject(admin, { name: 'Announce Crew (test)' });
    const { customer } = sale;
    const person = await ensurePerson(admin, { ...STAFF.execution });
    const inspection = await visitTask(sale, 'discom_inspection', admin.userId);
    await openChat(customer.phone, customer.customerId);
    await setVisit(admin, { taskId: inspection, day: addDays(today(), 9), slot: 'morning' });
    const before = (await replies(customer.phone)).length;
    await admin.post(`/tasks/${inspection}/assign`, { userId: person.id });
    expect((await replies(customer.phone)).length).toBe(before);

    const task = await visitTask(sale, 'panel_installation', admin.userId);
    const [day] = (await visitsOf(admin, { taskId: task })).freeDays;
    await setVisit(admin, { taskId: task, day: day ?? '', slot: 'morning' });
    for (const userId of [person.id, admin.userId, person.id])
      await admin.post(`/tasks/${task}/assign`, { userId });
    expect(await told(customer.phone)).toHaveLength(3);
  });

  it('a new pick starts the promise to confirm again', async () => {
    const sale = await sellProject(admin, { name: 'Pick Timer (test)' });
    const task = await visitTask(sale, 'structure_installation');
    const first = await askDay(admin, sale, { taskId: task });
    await pickDay(sale.customer.phone, first.list);
    await rows("UPDATE visits SET created_at = now() - interval '3 days' WHERE customer_id = $1", [
      sale.customer.customerId,
    ]);
    const second = await askDay(admin, sale, { taskId: task });
    await pickDay(sale.customer.phone, second.list);
    const [made] = await rows<{ fresh: boolean }>(
      "SELECT created_at > now() - interval '1 hour' AS fresh FROM visits WHERE customer_id = $1",
      [sale.customer.customerId],
    );
    expect(made?.fresh).toBe(true);
  });
});
