import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionChecks } from '../../../../worker/src/activities/action-checks';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat } from '../support/send';
import { noonOn, runVisitWorker } from '../support/visit-worker';
import { askDay, setVisit, visitsFor, visitsOf, visitTask } from '../support/visits';

// The visit ask on the "Asked from the customer" card, a visit that finished with its task, and the
// staff-check tiers (a row told at its tier is not looked at again).

describe('Visits: card, finished work, staff checks', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('the ask is on the card; cancelling it tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Visit Card (test)' });
    const { customer } = sale;
    const task = await visitTask(sale, 'site_survey');
    await askDay(admin, sale, { taskId: task });
    const card = await admin.get<{ id: string; type: string; status: string; title: string }[]>(
      `/document-requests?projectId=${sale.project.id}`,
    );
    const ask = card.find((one) => one.type === 'visit_pick');
    expect(ask).toMatchObject({ status: 'open' });
    expect(ask?.title).toMatch(/^Pick a day: site survey — /);
    await admin.post(`/document-requests/${ask?.id}/cancel`);
    expect((await lastReply(customer.phone))?.body).toBe(
      'You do not need to pick a day for our visit any more. Thank you.',
    );
  });

  it('a visit whose task was completed is done, not missed, and nobody is alerted', async () => {
    const sale = await sellProject(admin, { name: 'Visit Finished (test)' });
    const task = await visitTask(sale, 'structure_installation');
    await openChat(sale.customer.phone, sale.customer.customerId);
    const day = (await visitsOf(admin, { taskId: task })).freeDays[0] ?? '';
    await setVisit(admin, { taskId: task, day, slot: 'morning' });
    await rows(
      "UPDATE project_tasks SET status = 'completed', completed_at = now() WHERE id = $1",
      [task],
    );
    await runVisitWorker(noonOn(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)));
    expect((await visitsFor(sale.customer.customerId))[0]?.status).toBe('done');
    const alerts = await rows('SELECT 1 FROM notifications WHERE kind = $1 AND title LIKE $2', [
      'visit_missed',
      '%Visit Finished%',
    ]);
    expect(alerts).toHaveLength(0);
  });

  it('a staff check told at its tier is remembered and not asked again', async () => {
    const sale = await sellProject(admin, { name: 'Visit Check (test)' });
    const task = await visitTask(sale, 'site_survey');
    await askDay(admin, sale, { taskId: task });
    await rows(
      `UPDATE customer_actions SET status = 'received', done_at = now() - interval '5 days',
              updated_at = now() - interval '5 days', created_at = now() - interval '6 days'
        WHERE customer_id = $1 AND type = 'visit_pick'`,
      [sale.customer.customerId],
    );
    const now = new Date();
    await queueActionChecks(acceptanceDb().db, now);
    const [first] = await rows<{ tier: string | null }>(
      "SELECT payload->>'checkedTier' AS tier FROM customer_actions WHERE customer_id = $1 AND type = 'visit_pick'",
      [sale.customer.customerId],
    );
    expect(first?.tier).toBe('manager');
    const told = async () =>
      (
        await rows(
          "SELECT 1 FROM notifications WHERE kind = 'customer_action_check' AND title LIKE 'Confirm the visit day Visit Check%'",
        )
      ).length;
    const once = await told();
    expect(once).toBeGreaterThan(0);
    await queueActionChecks(acceptanceDb().db, now);
    expect(await told()).toBe(once);
  });
});
