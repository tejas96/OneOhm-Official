import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addLeave, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply } from '../support/onboarding';
import { addDays, sellProject, today } from '../support/sales';
import { openChat } from '../support/send';
import { askDay, pickDay, setVisit, visitsFor, visitsOf, visitTask } from '../support/visits';

// Visits (redesign §8): the team asks for a day, the customer picks it, the team confirm it.

describe('Visits: pick, confirm, change, cancel', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('asks for a day from the survey task; the pick is proposed, the team confirm; Booked; the task dates follow', async () => {
    const sale = await sellProject(admin, { name: 'Visit Pick (test)' });
    const { customer } = sale;
    const task = await visitTask(sale, 'site_survey', admin.userId);
    const { sent, list } = await askDay(admin, sale, { taskId: task });
    expect(sent.via).toBe('chat');
    expect(list?.kind).toBe('list');
    expect(list?.body).toMatch(/^When can our team visit \*.+\* for the \*site survey\*\?$/);
    const rowIds = (list?.rows ?? []).map((row) => row.id);
    expect(rowIds.at(-1)).toBe('go:talk');
    expect(rowIds.length).toBeGreaterThan(3);
    // Sunday is never on the list.
    for (const row of list?.rows ?? [])
      if (row.id.startsWith('vday:'))
        expect(new Date(`${row.id.split(':')[2]}T00:00:00Z`).getUTCDay()).not.toBe(0);
    // Asking again while it waits is refused.
    const again = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId: task },
      request: { action: 'ask_visit', taskId: task },
    });
    expect(again.status).toBe(409);

    const { day } = await pickDay(customer.phone, list, 'afternoon');
    expect((await lastReply(customer.phone))?.body).toMatch(/^Thanks — we'll confirm by \*.+\*\.$/);
    const [proposed] = await visitsFor(customer.customerId);
    expect(proposed).toMatchObject({
      kind: 'survey',
      status: 'proposed',
      slot: 'afternoon',
      proposed_by: 'customer',
      task_id: task,
    });
    const [ask] = await rows<{ status: string }>(
      "SELECT status::text FROM customer_actions WHERE customer_id = $1 AND type = 'visit_pick'",
      [customer.customerId],
    );
    expect(ask?.status).toBe('received');
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'visit_proposed' AND user_id = $1",
      [admin.userId],
    );
    expect(alert).toBeDefined();

    const shown = await visitsOf(admin, { taskId: task });
    expect(shown.visits[0]).toMatchObject({ status: 'proposed', day });
    const confirmed = await setVisit(admin, { taskId: task, day, slot: 'afternoon' });
    expect(confirmed.status).toBe('confirmed');
    const booked = await lastReply(customer.phone);
    expect(booked?.body).toMatch(/^Booked ✅ \*.+, afternoon\*\. .+ will call before coming/);
    expect(booked?.buttons?.map((button) => button.title)).toEqual(['Okay', 'Change day']);
    const [dates] = await rows<{ start_date: string }>(
      'SELECT start_date::text FROM project_tasks WHERE id = $1',
      [task],
    );
    expect(dates?.start_date).toBe(day);
    const [closed] = await rows<{ status: string }>(
      "SELECT status::text FROM customer_actions WHERE customer_id = $1 AND type = 'visit_pick'",
      [customer.customerId],
    );
    expect(closed?.status).toBe('closed');
    const [log] = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND kind = 'visit'",
      [sale.project.id],
    );
    expect(log).toBeDefined();
    const [audit] = await rows("SELECT 1 FROM audit_log WHERE action = 'visit.confirmed'");
    expect(audit).toBeDefined();
  });

  it('a task whose template does not message customers is not asked; Home shows the visit in 3 days', async () => {
    const sale = await sellProject(admin, { name: 'Visit Quiet (test)' });
    const [task] = await rows<{ id: string }>(
      "SELECT id FROM project_tasks WHERE project_id = $1 AND template_key = 'site_survey'",
      [sale.project.id],
    );
    await rows('UPDATE project_tasks SET notify_customer = false WHERE id = $1', [task?.id]);
    await openChat(sale.customer.phone, sale.customer.customerId);
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId: task?.id },
      request: { action: 'ask_visit', taskId: task?.id },
    });
    expect(refused.status).toBe(400);
    // The team can still book it; nothing goes to the customer.
    const soon = addDays(today(), 2);
    const day = new Date(`${soon}T00:00:00Z`).getUTCDay() === 0 ? addDays(soon, 1) : soon;
    const before = (await rows('SELECT 1 FROM outbox WHERE recipient = $1', [sale.customer.phone]))
      .length;
    await setVisit(admin, { taskId: task?.id ?? '', day, slot: 'morning' });
    const after = (await rows('SELECT 1 FROM outbox WHERE recipient = $1', [sale.customer.phone]))
      .length;
    expect(after).toBe(before);
    expect((await visitsFor(sale.customer.customerId))[0]).toMatchObject({
      status: 'confirmed',
      proposed_by: 'staff',
    });
  });

  it('free days skip leave and slots another visit of the same person already holds', async () => {
    const sale = await sellProject(admin, { name: 'Visit Free (test)' });
    const task = await visitTask(sale, 'structure_installation', admin.userId);
    const first = (await visitsOf(admin, { taskId: task })).freeDays;
    const tomorrow = first[0] ?? '';
    await addLeave(admin.userId, tomorrow, tomorrow);
    const second = (await visitsOf(admin, { taskId: task })).freeDays;
    expect(second).not.toContain(tomorrow);
    // A second project's task of the same person, booked on the next free day (both slots).
    const other = await sellProject(admin, { name: 'Visit Free Two (test)' });
    const otherTask = await visitTask(other, 'structure_installation', admin.userId);
    const nextDay = second[0] ?? '';
    await setVisit(admin, { taskId: otherTask, day: nextDay, slot: 'morning' });
    await setVisit(admin, { taskId: task, day: nextDay, slot: 'afternoon' });
    const third = (await visitsOf(admin, { taskId: task })).freeDays;
    expect(third).not.toContain(nextDay);
    const clash = await admin.raw('POST', '/visits', {
      taskId: otherTask,
      day: nextDay,
      slot: 'afternoon',
    });
    expect(clash.status).toBe(409);
  });

  it('staff change the day: the customer is told with Okay and Change day; cancel tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Visit Change (test)' });
    const { customer } = sale;
    const task = await visitTask(sale, 'panel_installation', admin.userId);
    await openChat(customer.phone, customer.customerId);
    const days = (await visitsOf(admin, { taskId: task })).freeDays;
    const [one, two] = days;
    const visit = await setVisit(admin, { taskId: task, day: one ?? '', slot: 'morning' });
    expect((await lastReply(customer.phone))?.body).toMatch(/^Booked ✅/);
    const moved = await setVisit(admin, { taskId: task, day: two ?? '', slot: 'afternoon' });
    expect(moved.id).toBe(visit.id);
    const told = await lastReply(customer.phone);
    expect(told?.body).toMatch(/^We have moved your visit to \*.+, afternoon\*\./);
    expect(told?.buttons?.map((button) => button.title)).toEqual(['Okay', 'Change day']);
    const [dates] = await rows<{ start_date: string }>(
      'SELECT start_date::text FROM project_tasks WHERE id = $1',
      [task],
    );
    expect(dates?.start_date).toBe(two);
    await admin.post(`/visits/${visit.id}/cancel`, {});
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^Your visit for the \*installation\* at .+ is cancelled\./,
    );
    expect((await visitsFor(customer.customerId))[0]?.status).toBe('cancelled');
    const [notice] = await rows("SELECT 1 FROM notifications WHERE kind = 'visit_cancelled'");
    expect(notice).toBeDefined();
    const done = await admin.raw('POST', `/visits/${visit.id}/done`, undefined);
    expect(done.status).toBe(409);
  });
});
