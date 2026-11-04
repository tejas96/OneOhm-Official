import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { runPaperReminders } from '../support/paper-reminders';
import { sellProject } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Papers per home, flow 2: a customer who has not answered is reminded once after 2 days
// and the asker told once after 4; files left "to sort" alert the chat's person after 2
// hours. The worker's job is run by hand here (the timer is off in this suite).

const HOUR = 3_600_000;

const ask = (admin: Session, projectId: string, title: string) =>
  admin.post<{ id: string }>('/document-requests', {
    projectId,
    category: 'electricity_bill',
    title,
  });

const askedHoursAgo = (id: string, hours: number) =>
  rows('UPDATE document_requests SET created_at = $2 WHERE id = $1', [
    id,
    new Date(Date.now() - hours * HOUR),
  ]);

const outboxFor = (dedupeKey: string) =>
  rows<{ template: string; payload: Record<string, string> }>(
    'SELECT template, payload FROM outbox WHERE dedupe_key IN ($1, $2)',
    [dedupeKey, `${dedupeKey}:sms`],
  );

const alertsKeyed = (prefix: string) =>
  rows<{ user_id: string; title: string }>(
    'SELECT user_id, title FROM notifications WHERE dedupe_key LIKE $1',
    [`${prefix}%`],
  );

describe('Papers per home: reminders', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('an old request reminds the customer once', async () => {
    const { project } = await sellProject(admin, { name: 'Remind Me (test)' });
    const asked = await ask(admin, project.id, 'Electricity bill (test)');
    const key = `paper_reminder:${asked.id}:0`;
    await runPaperReminders();
    expect(await outboxFor(key)).toHaveLength(0);
    await askedHoursAgo(asked.id, 49);
    await runPaperReminders();
    const [reminder] = await outboxFor(key);
    expect(reminder?.template).toMatch(/^(paper_request|document_requested)$/);
    expect(reminder?.payload).toMatchObject({
      customer: 'Remind Me (test)',
      document: 'Electricity bill (test)',
    });
    await runPaperReminders();
    expect(await outboxFor(key)).toHaveLength(1);
    // Not yet 4 days: the asker has not been told.
    expect(await alertsKeyed(`paper_waiting:${asked.id}`)).toHaveLength(0);
  });

  it('a 4-day request alerts the asker once', async () => {
    const { project } = await sellProject(admin, { name: 'Four Days (test)' });
    const asked = await ask(admin, project.id, 'Electricity bill (test)');
    await askedHoursAgo(asked.id, 97);
    await runPaperReminders();
    const told = await alertsKeyed(`paper_waiting:${asked.id}:0`);
    expect(told).toEqual([
      {
        user_id: admin.userId,
        title: 'Still waiting for Electricity bill (test) from Four Days (test)',
      },
    ]);
    await runPaperReminders();
    expect(await alertsKeyed(`paper_waiting:${asked.id}`)).toHaveLength(1);
    expect(await outboxFor(`paper_reminder:${asked.id}:0`)).toHaveLength(1);
  });

  it('a request older than the windows is left alone', async () => {
    const { project } = await sellProject(admin, { name: 'Long Ago (test)' });
    const asked = await ask(admin, project.id, 'Electricity bill (test)');
    await askedHoursAgo(asked.id, 30 * 24);
    await runPaperReminders();
    expect(await outboxFor(`paper_reminder:${asked.id}:0`)).toHaveLength(0);
    expect(await alertsKeyed(`paper_waiting:${asked.id}`)).toHaveLength(0);
    // 8 days: too late to remind the customer, still time to tell the asker.
    await askedHoursAgo(asked.id, 8 * 24);
    await runPaperReminders();
    expect(await outboxFor(`paper_reminder:${asked.id}:0`)).toHaveLength(0);
    expect(await alertsKeyed(`paper_waiting:${asked.id}`)).toHaveLength(1);
  });

  it("files left to sort alert the chat's person after 2 hours", async () => {
    const { customer } = await sellProject(admin, { name: 'To Sort (test)' });
    await anotherHome(admin, customer, 'Farm (test)');
    for (const n of [1, 2, 3])
      await sendInbound(customer.phone, {
        media: { type: 'image', fileId: `sort-${randomUUID()}-${n}` },
      });
    const age = (hours: number) =>
      rows('UPDATE documents SET created_at = $2 WHERE customer_id = $1', [
        customer.customerId,
        new Date(Date.now() - hours * HOUR),
      ]);
    const sortAlerts = () =>
      rows<{ user_id: string; title: string; body: string }>(
        `SELECT n.user_id, n.title, n.body FROM notifications n
          WHERE n.dedupe_key LIKE 'paper_sort:%'
            AND n.dedupe_key LIKE ANY (SELECT 'paper_sort:' || id || ':%' FROM documents
                                        WHERE customer_id = $1)`,
        [customer.customerId],
      );
    await runPaperReminders();
    expect(await sortAlerts()).toHaveLength(0);
    // Sent 8 days ago: too old for this job.
    await age(8 * 24);
    await runPaperReminders();
    expect(await sortAlerts()).toHaveLength(0);
    await age(3);
    await runPaperReminders();
    expect(await sortAlerts()).toEqual([
      {
        user_id: admin.userId,
        title: 'Files to sort from To Sort (test)',
        body: '3 files have no home yet. Open the chat and move them to the right home.',
      },
    ]);
    await runPaperReminders();
    expect(await sortAlerts()).toHaveLength(1);
    // A later file gives one fresh alert.
    await sendInbound(customer.phone, {
      media: { type: 'image', fileId: `sort-${randomUUID()}-4` },
    });
    await rows(
      `UPDATE documents SET created_at = now() - interval '3 hours'
        WHERE customer_id = $1 AND created_at > now() - interval '1 hour'`,
      [customer.customerId],
    );
    await runPaperReminders();
    expect(await sortAlerts()).toHaveLength(2);
  });

  it('one home has nothing to sort', async () => {
    const { customer } = await sellProject(admin, { name: 'Single Home (test)' });
    await sendInbound(customer.phone, { media: { type: 'image', fileId: `one-${randomUUID()}` } });
    await rows('UPDATE documents SET created_at = $2 WHERE customer_id = $1', [
      customer.customerId,
      new Date(Date.now() - 3 * HOUR),
    ]);
    await runPaperReminders();
    const docs = await rows<{ id: string }>('SELECT id FROM documents WHERE customer_id = $1', [
      customer.customerId,
    ]);
    for (const doc of docs) expect(await alertsKeyed(`paper_sort:${doc.id}`)).toHaveLength(0);
  });
});
