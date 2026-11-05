import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_FOLDER } from '@oneohm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { addDays, newCustomer, sellProject, today } from '../support/sales';
import { closeChat, openChat } from '../support/send';
import { advanceTo, project, surveyFacts, workTask } from '../support/tasks';
import { eveningOn, noonOn, runVisitWorker } from '../support/visit-worker';
import { askDay, pickDay, setVisit, visitsFor, visitsOf, visitTask } from '../support/visits';

// Review fixes for visits (phase 3b, fix round 1).

const alerts = async (kind: string, name: string) =>
  (await rows<{ title: string }>('SELECT title FROM notifications WHERE kind = $1', [kind])).filter(
    (one) => one.title.includes(name),
  );

const workingDayAfter = (day: string, n = 1) => {
  let at = day;
  for (let left = n; left > 0; ) {
    at = addDays(at, 1);
    if (new Date(`${at}T00:00:00Z`).getUTCDay() !== 0) left -= 1;
  }
  return at;
};

describe('Visits: review fixes', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('a DISCOM date on a task that does not message customers is never told, and never alerted as unanswered', async () => {
    const sale = await sellProject(admin, { name: 'Review Quiet Discom (test)' });
    const task = await visitTask(sale, 'discom_inspection');
    await rows('UPDATE project_tasks SET notify_customer = false WHERE id = $1', [task]);
    await setVisit(admin, { taskId: task, day: addDays(today(), 8), slot: 'morning' });
    const [visit] = await visitsFor(sale.customer.customerId);
    expect(
      await rows('SELECT told_at FROM visits WHERE id = $1 AND told_at IS NOT NULL', [visit?.id]),
    ).toHaveLength(0);
    await runVisitWorker(noonOn(addDays(today(), 5)));
    await runVisitWorker(noonOn(addDays(today(), 7)));
    expect(await alerts('visit_not_confirmed', 'Review Quiet Discom')).toHaveLength(0);
  });

  it('a DISCOM date tomorrow that the customer has not confirmed alerts the owner', async () => {
    const sale = await sellProject(admin, { name: 'Review Tomorrow (test)' });
    const task = await visitTask(sale, 'discom_inspection');
    await closeChat(sale.customer.phone);
    const day = workingDayAfter(today(), 4);
    await setVisit(admin, { taskId: task, day, slot: 'morning' });
    await runVisitWorker(noonOn(previous(day)));
    const found = await alerts('visit_not_confirmed', 'Review Tomorrow');
    expect(found.some((one) => one.title.includes('is tomorrow'))).toBe(true);
  });

  it('cancelling a proposed visit cancels the customer ask; a lead survey cancel puts the stage back', async () => {
    const sale = await sellProject(admin, { name: 'Review Cancel (test)' });
    const task = await visitTask(sale, 'site_survey');
    const { list } = await askDay(admin, sale, { taskId: task });
    await pickDay(sale.customer.phone, list);
    const [proposed] = await visitsFor(sale.customer.customerId);
    await admin.post(`/visits/${proposed?.id}/cancel`, {});
    const [ask] = await rows<{ status: string }>(
      "SELECT status::text FROM customer_actions WHERE customer_id = $1 AND type = 'visit_pick'",
      [sale.customer.customerId],
    );
    expect(ask?.status).toBe('cancelled');

    const customer = await newCustomer(admin, { name: 'Review Lead (test)' });
    await openChat(customer.phone, customer.customerId);
    const scope = { leadId: customer.leadId };
    const [free] = (await visitsOf(admin, scope)).freeDays;
    const visit = await setVisit(admin, { ...scope, day: free ?? '', slot: 'morning' });
    const stage = async () =>
      (
        await rows<{ stage: string; note: string | null }>(
          'SELECT stage::text, next_action_note AS note FROM leads WHERE id = $1',
          [customer.leadId],
        )
      )[0];
    expect((await stage())?.stage).toBe('survey_scheduled');
    await admin.post(`/visits/${visit.id}/cancel`, {});
    expect(await stage()).toMatchObject({ stage: 'new', note: null });
  });

  it('a proposed pick is not the ticket day; saving that day confirms it and tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Review Ticket (test)' });
    const { customer } = sale;
    const [request] = await rows<{ id: string }>(
      `INSERT INTO service_requests (customer_id, project_id, category, description) VALUES ($1, $2, 'inverter', 'x (test)') RETURNING id`,
      [customer.customerId, sale.project.id],
    );
    const id = request?.id ?? '';
    const { list } = await askDay(admin, sale, { serviceRequestId: id });
    const { day } = await pickDay(customer.phone, list);
    const shown = async () =>
      (
        await rows<{ on: string | null }>(
          'SELECT visit_on::text AS on FROM service_requests WHERE id = $1',
          [id],
        )
      )[0]?.on;
    expect(await shown()).toBeNull();
    await admin.put(`/service-requests/${id}/visit-day`, { visitOn: day });
    expect(await shown()).toBe(day);
    expect((await visitsFor(customer.customerId))[0]?.status).toBe('confirmed');
    expect((await lastReply(customer.phone))?.body).toMatch(/^Booked ✅/);
    const [audit] = await rows(
      "SELECT 1 FROM audit_log WHERE entity = 'service_request' AND entity_id = $1 AND action = 'visit.proposed'",
      [id],
    );
    expect(audit).toBeDefined();
  });

  it('a missed visit can be marked done; completing the task marks its visit done at once; a reschedule past a booked visit is refused', async () => {
    const sale = await sellProject(admin, { name: 'Review Done (test)' });
    const task = await visitTask(sale, 'structure_installation');
    await closeChat(sale.customer.phone);
    const day = workingDayAfter(today(), 2);
    const visit = await setVisit(admin, { taskId: task, day, slot: 'morning' });
    const shown = await visitsOf(admin, { taskId: task });
    expect(shown.taskStartDate).toBe(day);
    const clash = await admin.raw('POST', `/tasks/${task}/reschedule`, {
      dueDate: today(),
      reason: 'test',
    });
    expect(clash.status).toBe(409);
    await runVisitWorker(eveningOn(day));
    expect((await visitsFor(sale.customer.customerId))[0]?.status).toBe('missed');
    const done = await admin.post<{ status: string }>(`/visits/${visit.id}/done`, undefined);
    expect(done.status).toBe('done');

    // Completing the task closes an open visit in the same moment.
    const other = await sellProject(admin, { name: 'Review Complete (test)' });
    const survey = await advanceTo(admin, other.project.id, 'site_survey');
    await rows('UPDATE project_tasks SET notify_customer = true WHERE id = $1', [survey.id]);
    await setVisit(admin, { taskId: survey.id, day: workingDayAfter(today(), 1), slot: 'morning' });
    await workTask(admin, survey, {
      facts: await surveyFacts(admin, await project(admin, other.project.id), survey),
    });
    expect((await visitsFor(other.customer.customerId))[0]?.status).toBe('done');
  });

  it('Home and Visit details hide a visit whose task does not message customers', async () => {
    const sale = await sellProject(admin, { name: 'Review Hidden (test)' });
    const { customer } = sale;
    const task = await visitTask(sale, 'structure_installation');
    await openChat(customer.phone, customer.customerId);
    await setVisit(admin, { taskId: task, day: workingDayAfter(today(), 1), slot: 'morning' });
    await rows('UPDATE project_tasks SET notify_customer = false WHERE id = $1', [task]);
    await tap(customer.phone, 'go:visit');
    expect((await lastReply(customer.phone))?.body ?? '').not.toMatch(/installation/);
  });

  it('the migration backfill takes the days still ahead only', async () => {
    const sale = await sellProject(admin, { name: 'Review Backfill (test)' });
    const { customer } = sale;
    const make = async (on: string) =>
      (
        await rows<{ id: string }>(
          `INSERT INTO service_requests (customer_id, project_id, category, description, visit_on) VALUES ($1, $2, 'inverter', 'b (test)', $3) RETURNING id`,
          [customer.customerId, sale.project.id, on],
        )
      )[0]?.id;
    const ahead = await make(addDays(today(), 3));
    const past = await make(addDays(today(), -3));
    const sql = readFileSync(join(MIGRATIONS_FOLDER, '0080_visits.sql'), 'utf8');
    const insert = sql
      .split('--> statement-breakpoint')
      .find((part) => part.includes('INSERT INTO "visits"'));
    if (!insert) throw new Error('no backfill statement');
    await rows(insert.replace(/--.*\n/g, ''));
    const made = await rows<{ service_request_id: string }>(
      'SELECT service_request_id FROM visits WHERE customer_id = $1',
      [customer.customerId],
    );
    expect(made.map((one) => one.service_request_id)).toEqual([ahead]);
    expect(past).toBeDefined();
  });
});

/** The working day before `day`. */
function previous(day: string): string {
  let at = addDays(day, -1);
  if (new Date(`${at}T00:00:00Z`).getUTCDay() === 0) at = addDays(at, -1);
  return at;
}
