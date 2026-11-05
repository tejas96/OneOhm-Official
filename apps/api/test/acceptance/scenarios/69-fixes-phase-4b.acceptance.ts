import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cancelAllAsks } from '../../../src/modules/send-to-customer/send-cancel-all';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { setNotify, taskIdOf, taskRow } from '../support/journey-steps';
import { replies } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat, sendTo } from '../support/send';

// Fixes from the phase 4b review: a cancel never flips an answer that committed first; loan papers asked
// before the wait still end it; another lead's or home's asks survive; an expired bank day keeps the
// customer's answer; the loan news is not "sent" to someone who said STOP.

describe('Phase 4b fixes', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** A transaction whose first ask update runs after `before` (an answer that commits in between). */
  async function cancelRacing(
    scope: { projectId: string } | { leadId: string },
    before: () => Promise<unknown>,
  ) {
    return acceptanceDb().db.transaction(async (tx) => {
      let raced = false;
      const racing = new Proxy(tx, {
        get(target, key, receiver) {
          if (key !== 'update') return Reflect.get(target, key, receiver);
          return (table: unknown) => {
            const real = target.update(table as never) as never as {
              set: (v: unknown) => {
                where: (c: unknown) => { returning: (r?: unknown) => Promise<unknown> };
              };
            };
            return {
              set: (values: unknown) => ({
                where: (condition: unknown) => ({
                  returning: async (r?: unknown) => {
                    if (!raced) {
                      raced = true;
                      await before();
                    }
                    return real.set(values).where(condition).returning(r);
                  },
                }),
              }),
            };
          };
        },
      });
      return cancelAllAsks(racing, scope, admin.userId, 'lead lost');
    });
  }

  it('an ask answered just before the cancel stays closed and the customer is not told "closed everything" for it', async () => {
    const sale = await sellProject(admin, { name: 'Cancel Race (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    await sendTo(admin, { projectId: sale.project.id }, { action: 'ask_callback' });
    const [ask] = await rows<{ id: string }>(
      "SELECT id FROM customer_actions WHERE customer_id = $1 AND type = 'callback'",
      [sale.customer.customerId],
    );
    const before = (await replies(sale.customer.phone)).length;
    const count = await cancelRacing({ projectId: sale.project.id }, () =>
      rows("UPDATE customer_actions SET status = 'closed', closed_at = now() WHERE id = $1", [
        ask?.id,
      ]),
    );
    expect(count).toBe(0);
    const [after] = await rows<{ status: string }>(
      'SELECT status::text AS status FROM customer_actions WHERE id = $1',
      [ask?.id],
    );
    expect(after?.status).toBe('closed');
    expect((await replies(sale.customer.phone)).length).toBe(before);
    const lines = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE 'Cancelled % customer request%'",
      [sale.project.id],
    );
    expect(lines).toHaveLength(0);
  });

  it('a visit that was cancelled at the same moment is not cancelled or counted twice', async () => {
    const sale = await sellProject(admin, { name: 'Cancel Race Visit (test)' });
    const [task] = await rows<{ id: string }>(
      "SELECT id FROM project_tasks WHERE project_id = $1 AND template_key = 'site_survey'",
      [sale.project.id],
    );
    await setNotify(sale, 'site_survey', true);
    const visit = await admin.post<{ id: string }>('/visits', {
      taskId: task?.id,
      day: nextWorkingDay(),
      slot: 'morning',
    });
    const count = await cancelRacing({ projectId: sale.project.id }, () =>
      rows("UPDATE visits SET status = 'done', done_at = now() WHERE id = $1", [visit.id]),
    );
    expect(count).toBe(0);
    const [row] = await rows<{ status: string }>(
      'SELECT status::text AS status FROM visits WHERE id = $1',
      [visit.id],
    );
    expect(row?.status).toBe('done');
  });

  it("another lead's or home's asks of the same customer survive a cancel", async () => {
    const sale = await sellProject(admin, { name: 'Cancel Other (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    await admin.post('/document-requests', {
      projectId: sale.project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });
    // The lead the customer came from is lost: the project's ask is not its business.
    const count = await acceptanceDb().db.transaction((tx) =>
      cancelAllAsks(tx, { leadId: sale.customer.leadId }, admin.userId, 'lead lost'),
    );
    expect(count).toBe(0);
    const [ask] = await rows<{ status: string }>(
      "SELECT status::text AS status FROM customer_actions WHERE project_id = $1 AND type = 'paper'",
      [sale.project.id],
    );
    expect(ask?.status).toBe('open');
  });

  it('cancelling a project does not wake its waiting step, and a signed copy is cancelled and audited once', async () => {
    const sale = await sellProject(admin, { name: 'Cancel Settle (test)' });
    const { customer, project } = sale;
    const stepId = await taskIdOf(sale, 'dispatch_material');
    const since = new Date(Date.now() - 86_400_000);
    await rows(
      "UPDATE project_tasks SET status = 'waiting', waiting_party = 'customer', waiting_since = $2 WHERE id = $1",
      [stepId, since],
    );
    await rows(
      `INSERT INTO customer_actions (type, customer_id, project_id, task_id, title, payload)
       VALUES ('confirm', $1, $2, $3, 'Roof ready? (test)', $4)`,
      [
        customer.customerId,
        project.id,
        stepId,
        JSON.stringify({ kind: 'site_ready', answer: 'not_yet', waitSince: since.toISOString() }),
      ],
    );
    const [copy] = await rows<{ id: string }>(
      `INSERT INTO customer_actions (type, customer_id, project_id, title, category, payload)
       VALUES ('paper', $1, $2, 'Signed copy (test)', 'discom', '{}') RETURNING id`,
      [customer.customerId, project.id],
    );
    await rows(
      `INSERT INTO customer_actions (type, customer_id, project_id, title, payload)
       VALUES ('signature', $1, $2, 'Agreement (test)', $3)`,
      [
        customer.customerId,
        project.id,
        JSON.stringify({ signedActionId: copy?.id, agreedAt: new Date().toISOString() }),
      ],
    );
    await rows("UPDATE projects SET status = 'cancelled' WHERE id = $1", [project.id]);
    await acceptanceDb().db.transaction((tx) =>
      cancelAllAsks(tx, { projectId: project.id }, admin.userId, 'project cancelled'),
    );
    expect((await taskRow(stepId))?.status).toBe('waiting');
    const audits = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'customer_action.cancelled' AND entity_id = $1",
      [copy?.id],
    );
    expect(audits).toHaveLength(1);
  });
});

function nextWorkingDay(): string {
  const day = new Date(Date.now() + (3 + Math.floor(Math.random() * 40)) * 86_400_000);
  if (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
