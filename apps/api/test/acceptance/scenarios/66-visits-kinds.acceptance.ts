import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { addDays, sellProject, today } from '../support/sales';
import { closeChat, openChat, templatesFor } from '../support/send';
import { noonOn, runVisitWorker } from '../support/visit-worker';
import { setVisit, visitsFor, visitsOf, visitTask } from '../support/visits';

// DISCOM presence, service visits and AMC through the one record, and a lead's survey (redesign §8).

const alertsOf = (kind: string) =>
  rows<{ title: string; body: string }>('SELECT title, body FROM notifications WHERE kind = $1', [
    kind,
  ]);

describe('Visits: DISCOM presence, service visits, Home', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('tells the DISCOM inspection date: I will be there is logged; Change day alerts the liaisoning owner; no reply in 1 working day alerts too', async () => {
    const sale = await sellProject(admin, { name: 'Visit Discom (test)' });
    const { customer } = sale;
    const task = await visitTask(sale, 'discom_inspection', admin.userId);
    await openChat(customer.phone, customer.customerId);
    const asked = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId: task },
      request: { action: 'ask_visit', taskId: task },
    });
    expect(asked.status).toBe(400);
    const day = addDays(today(), 6);
    const visit = await setVisit(admin, { taskId: task, day, slot: 'morning' });
    const told = await lastReply(customer.phone);
    expect(told?.body).toMatch(
      /^The electricity board \(DISCOM\) will do the \*DISCOM inspection\* at \*.+\* on \*.+\*\. Please be at home\.$/,
    );
    expect(told?.buttons?.map((button) => button.title)).toEqual(["I'll be there", 'Change day']);
    const [action] = await rows<{ status: string }>(
      "SELECT status::text FROM customer_actions WHERE customer_id = $1 AND type = 'presence'",
      [customer.customerId],
    );
    expect(action?.status).toBe('open');
    await tap(customer.phone, `vcf:${visit.id}`);
    expect((await lastReply(customer.phone))?.body).toBe(
      'Thank you ✅ We have noted you will be there.',
    );
    const [closed] = await rows<{ status: string }>(
      "SELECT status::text FROM customer_actions WHERE customer_id = $1 AND type = 'presence'",
      [customer.customerId],
    );
    expect(closed?.status).toBe('closed');
    expect((await visitsFor(customer.customerId))[0]?.customer_confirmed_at).not.toBeNull();

    // Net meter fitting: Change day tells the person who liaises, with the reason.
    const meter = await sellProject(admin, { name: 'Visit Net Meter (test)' });
    const meterTask = await visitTask(meter, 'net_meter_installation', admin.userId);
    await openChat(meter.customer.phone, meter.customer.customerId);
    const fitting = await setVisit(admin, { taskId: meterTask, day, slot: 'morning' });
    await tap(meter.customer.phone, `vchg:${fitting.id}`);
    expect((await visitsFor(meter.customer.customerId))[0]?.customer_cannot_at).not.toBeNull();
    const [cannot] = (await alertsOf('visit_customer_cannot')).filter((one) =>
      one.title.includes('Visit Net Meter'),
    );
    expect(cannot?.title).toMatch(/cannot be at home on/);
    expect(cannot?.body).toMatch(/new date with the DISCOM/);
    expect((await lastReply(meter.customer.phone))?.body).toMatch(
      /will call you about a new day\.$/,
    );

    // No reply in 1 working day: the owner is told once.
    const quiet = await sellProject(admin, { name: 'Visit Quiet Discom (test)' });
    const quietTask = await visitTask(quiet, 'discom_inspection', admin.userId);
    await closeChat(quiet.customer.phone);
    await setVisit(admin, { taskId: quietTask, day, slot: 'morning' });
    const waiting = async () =>
      (await alertsOf('visit_not_confirmed')).filter((one) =>
        one.title.includes('Visit Quiet Discom'),
      );
    await runVisitWorker(new Date());
    expect(await waiting()).toHaveLength(0);
    const later = noonOn(addDays(today(), 3));
    await runVisitWorker(later);
    expect(await waiting()).toHaveLength(1);
    await runVisitWorker(later);
    expect(await waiting()).toHaveLength(1);
  });

  it('the service desk visit day goes through the same record, messages with Okay / Change day, and Home shows it', async () => {
    const sale = await sellProject(admin, { name: 'Visit Service (test)' });
    const { customer } = sale;
    const [request] = await rows<{ id: string }>(
      `INSERT INTO service_requests (customer_id, project_id, category, description, assignee_user_id)
       VALUES ($1, $2, 'inverter', 'Inverter error (test)', NULL) RETURNING id`,
      [customer.customerId, sale.project.id],
    );
    const id = request?.id ?? '';
    await openChat(customer.phone, customer.customerId);
    const day = addDays(today(), 2);
    const bookedOn = new Date(`${day}T00:00:00Z`).getUTCDay() === 0 ? addDays(day, 1) : day;
    const ticket = await admin.put<{ visitOn: string | null }>(
      `/service-requests/${id}/visit-day`,
      {
        visitOn: bookedOn,
      },
    );
    expect(ticket.visitOn).toBe(bookedOn);
    const [visit] = await visitsFor(customer.customerId);
    expect(visit).toMatchObject({ kind: 'service', status: 'confirmed', day: bookedOn });
    const told = await lastReply(customer.phone);
    expect(told?.body).toMatch(/^Booked ✅/);
    expect(told?.buttons?.map((button) => button.title)).toEqual(['Okay', 'Change day']);
    const scope = await visitsOf(admin, { serviceRequestId: id });
    expect(scope.visits[0]).toMatchObject({ kind: 'service', day: bookedOn });
    // The same day again says nothing more.
    const before = (await rows('SELECT 1 FROM outbox WHERE recipient = $1', [customer.phone]))
      .length;
    await admin.put(`/service-requests/${id}/visit-day`, { visitOn: bookedOn });
    expect((await rows('SELECT 1 FROM outbox WHERE recipient = $1', [customer.phone])).length).toBe(
      before,
    );

    // [Visit details] lists it with the day, slot, work and home.
    await tap(customer.phone, 'go:visit');
    expect((await lastReply(customer.phone))?.body).toMatch(/• \*.+, morning\* — service visit · /);

    // Clearing the day cancels the visit quietly.
    await admin.put(`/service-requests/${id}/visit-day`, { visitOn: null });
    expect((await visitsFor(customer.customerId))[0]?.status).toBe('cancelled');
    // Closed chat + the new template off: the older approved message still goes.
    await closeChat(customer.phone);
    await admin.put(`/service-requests/${id}/visit-day`, { visitOn: addDays(bookedOn, 1) });
    expect(await templatesFor(customer.phone, 'service_visit_booked')).toHaveLength(1);
  });
});
