import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionChecks } from '../../../../worker/src/activities/action-checks';
import { moveLaterTasks } from '../../../src/modules/projects/task-schedule';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { addDays, sellProject, today } from '../support/sales';
import { closeChat, openChat } from '../support/send';
import { ensurePerson, STAFF } from '../support/team';
import { morningOn, noonOn, runVisitWorker, templateOn } from '../support/visit-worker';
import { setVisit, visitsFor, visitsOf, visitTask } from '../support/visits';

// Fix round 2 for visits: the person who comes follows reassignment, task moves alert, wording.

const alerts = async (kind: string, name = '') =>
  (
    await rows<{ title: string; body: string }>(
      'SELECT title, body FROM notifications WHERE kind = $1',
      [kind],
    )
  ).filter((one) => one.title.includes(name));

const previousWorkingDay = (day: string) => {
  const before = addDays(day, -1);
  return new Date(`${before}T00:00:00Z`).getUTCDay() === 0 ? addDays(before, -1) : before;
};

const nextWorkingDay = (day: string) => {
  const next = addDays(day, 1);
  return new Date(`${next}T00:00:00Z`).getUTCDay() === 0 ? addDays(next, 1) : next;
};

describe('Visits: review fixes, round 2', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('reassigning a task with a confirmed visit moves the crew, tells the customer and logs it; a busy person is alerted', async () => {
    const sale = await sellProject(admin, { name: 'Follow Crew (test)' });
    const { customer } = sale;
    const person = await ensurePerson(admin, { ...STAFF.execution });
    const busy = await ensurePerson(admin, { ...STAFF.service });
    const task = await visitTask(sale, 'panel_installation', admin.userId);
    await openChat(customer.phone, customer.customerId);
    const [day] = (await visitsOf(admin, { taskId: task })).freeDays;
    await setVisit(admin, { taskId: task, day: day ?? '', slot: 'morning' });
    await admin.post(`/tasks/${task}/assign`, { userId: person.id });
    const [visit] = await visitsFor(customer.customerId);
    expect(visit?.crew_user_ids).toEqual([person.id]);
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^Your visit on \*.+\*: Vikram will call before coming/,
    );
    const [log] = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE '%now comes for the visit%'",
      [sale.project.id],
    );
    expect(log).toBeDefined();

    // Someone who already holds that slot (or is away) cannot just be given it.
    const other = await sellProject(admin, { name: 'Follow Busy (test)' });
    const otherTask = await visitTask(other, 'panel_installation', busy.id);
    await setVisit(admin, { taskId: otherTask, day: day ?? '', slot: 'morning' });
    await admin.post(`/tasks/${task}/assign`, { userId: busy.id });
    const found = await alerts('visit_crew_busy', 'Sachin');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.body).toMatch(/already has a visit in that slot/);
  });

  it('a task moved later than its visit alerts the visit owner', async () => {
    const sale = await sellProject(admin, { name: 'Follow Move (test)' });
    const survey = (
      await rows<{ id: string; title: string }>(
        "SELECT id, title FROM project_tasks WHERE project_id = $1 AND template_key = 'site_survey'",
        [sale.project.id],
      )
    )[0];
    const task = await visitTask(sale, 'structure_installation');
    await setVisit(admin, { taskId: task, day: nextWorkingDay(today()), slot: 'morning' });
    await moveLaterTasks(
      acceptanceDb().db,
      { id: survey?.id ?? '', projectId: sale.project.id, title: survey?.title ?? '' },
      addDays(today(), 40),
    );
    expect((await alerts('visit_task_moved')).length).toBeGreaterThan(0);
  });

  it('a visit ask is not a pin waiting for its home', async () => {
    const sale = await sellProject(admin, { name: 'Pin Branch (test)' });
    await rows(
      `INSERT INTO customer_actions (type, customer_id, project_id, title, payload, created_at, updated_at)
       VALUES ('visit_pick', $1, NULL, 'Pick a day (test)', '{"visitKind":"amc"}', now() - interval '5 days', now() - interval '5 days')`,
      [sale.customer.customerId],
    );
    await queueActionChecks(acceptanceDb().db, new Date());
    const waiting = (await alerts('location_home_waiting')).filter((one) =>
      one.title.includes('Pin Branch'),
    );
    expect(waiting).toHaveLength(0);
    // The old ask is not left behind for the reminder counts of other scenarios.
    await rows("DELETE FROM customer_actions WHERE title = 'Pick a day (test)'");
  });

  it('the morning alert says the message is off only when it is off', async () => {
    const off = await sellProject(admin, { name: 'Wording Off (test)' });
    const on = await sellProject(admin, { name: 'Wording On (test)' });
    const taskOff = await visitTask(off, 'panel_installation');
    const taskOn = await visitTask(on, 'panel_installation');
    const [dayOff, dayOn] = (await visitsOf(admin, { taskId: taskOff })).freeDays.slice(2, 4);
    await closeChat(off.customer.phone);
    await closeChat(on.customer.phone);
    await setVisit(admin, { taskId: taskOff, day: dayOff ?? '', slot: 'morning' });
    await setVisit(admin, { taskId: taskOn, day: dayOn ?? '', slot: 'morning' });
    await runVisitWorker(morningOn(dayOff ?? ''));
    expect((await alerts('visit_not_confirmed', 'Wording Off'))[0]?.body).toMatch(
      /the message is off/,
    );
    const restore = await templateOn('visit_reminder');
    await runVisitWorker(morningOn(dayOn ?? ''));
    await restore();
    const text = (await alerts('visit_not_confirmed', 'Wording On'))[0]?.body ?? '';
    expect(text).toMatch(/^No reminder reached them\./);
  });

  it('Visit details shows a visit of a messaging task and hides one of a silent task', async () => {
    const sale = await sellProject(admin, { name: 'Hidden Control (test)' });
    const { customer } = sale;
    const quiet = await visitTask(sale, 'structure_installation');
    const loud = await visitTask(sale, 'site_survey');
    await openChat(customer.phone, customer.customerId);
    await setVisit(admin, { taskId: quiet, day: nextWorkingDay(today()), slot: 'morning' });
    await setVisit(admin, { taskId: loud, day: nextWorkingDay(today()), slot: 'afternoon' });
    await rows('UPDATE project_tasks SET notify_customer = false WHERE id = $1', [quiet]);
    await tap(customer.phone, 'go:visit');
    const text = (await lastReply(customer.phone))?.body ?? '';
    expect(text).toMatch(/site survey/);
    expect(text).not.toMatch(/installation/);
  });

  it('a DISCOM date told a moment ago is not chased as unconfirmed the day before', async () => {
    const sale = await sellProject(admin, { name: 'Fresh Told (test)' });
    const task = await visitTask(sale, 'discom_inspection');
    await closeChat(sale.customer.phone);
    const day = nextWorkingDay(nextWorkingDay(today()));
    await setVisit(admin, { taskId: task, day, slot: 'morning' });
    const eve = noonOn(previousWorkingDay(day));
    // Told half an hour before that noon: no alert yet.
    await rows('UPDATE visits SET told_at = $2 WHERE customer_id = $1', [
      sale.customer.customerId,
      new Date(eve.getTime() - 30 * 60_000),
    ]);
    await runVisitWorker(eve);
    expect(await alerts('visit_not_confirmed', 'Fresh Told')).toHaveLength(0);
    await rows('UPDATE visits SET told_at = $2 WHERE customer_id = $1', [
      sale.customer.customerId,
      new Date(eve.getTime() - 4 * 86_400_000),
    ]);
    await runVisitWorker(eve);
    expect((await alerts('visit_not_confirmed', 'Fresh Told')).length).toBeGreaterThan(0);
  });
});
