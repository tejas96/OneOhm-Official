import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import {
  addPaper,
  logLines,
  NOON,
  offerOf,
  setNotify,
  stepAsks,
  taskIdOf,
} from '../support/journey-steps';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat, sendTo } from '../support/send';

// Roof layout approval (redesign §4 Design, §18): the layout PDF with "Here is how the panels will sit
// on your {home} roof." [Looks good] [I have a question], sent from the design task.

describe('Journey: layout approval', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function layoutSent(name: string) {
    const sale = await sellProject(admin, { name });
    const taskId = await setNotify(sale, 'system_design', true);
    await addPaper(admin, sale, 'commissioning_handover', 'Panel layout (test)');
    await openChat(sale.customer.phone, sale.customer.customerId);
    const scope = { taskId, projectId: sale.project.id };
    const [offer] = await offerOf(admin, scope, 'send_layout');
    if (!offer?.request) throw new Error('No layout offer.');
    await sendTo(admin, { taskId }, offer.request);
    return { sale, taskId, scope, offer };
  }

  it('sends the layout with two buttons; Looks good is logged on the design task', async () => {
    const { sale, taskId, offer } = await layoutSent('Layout Good (test)');
    const { customer } = sale;
    expect(offer.label).toBe('Send Panel layout (test).pdf for approval');
    expect(offer.preview?.buttons).toEqual(['Looks good', 'I have a question']);
    const [file, question] = (await replies(customer.phone)).slice(-2);
    expect(file?.kind).toBe('document');
    expect(question?.body).toMatch(/^Here is how the panels will sit on your \*.+\* roof\.$/);
    expect(question?.buttons?.map((button) => button.title)).toEqual([
      'Looks good',
      'I have a question',
    ]);
    const [ask] = await stepAsks(customer.customerId, 'layout');
    expect(ask).toMatchObject({ status: 'open', task_id: taskId });
    // The same layout is not asked twice at once.
    expect(
      (await admin.raw('POST', '/send-to-customer', { scope: { taskId }, request: offer.request }))
        .status,
    ).toBe(409);

    await tap(customer.phone, question?.buttons?.[0]?.id ?? '');
    expect((await stepAsks(customer.customerId, 'layout'))[0]?.status).toBe('closed');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^Thank you ✅ We have noted that you are happy with the layout\./,
    );
    const [line] = await logLines(sale.project.id, '%approved the layout Panel layout (test)%');
    expect(line?.task_id).toBe(taskId);
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'layout_approved' AND subject_id = $1",
      [taskId],
    );
    expect(alert).toBeDefined();
  });

  it('a question goes to a person with the layout named; the ask stays open until they approve', async () => {
    const { sale } = await layoutSent('Layout Question (test)');
    const { customer } = sale;
    const question = (await replies(customer.phone)).at(-1);
    await tap(customer.phone, question?.buttons?.[1]?.id ?? '');
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'whatsapp_handover' AND body LIKE '%Question about the layout Panel layout (test)%'",
    );
    expect(alert).toBeDefined();
    expect((await stepAsks(customer.customerId, 'layout'))[0]?.status).toBe('open');
    // A person is handling it: no reminder and no alert, however old the ask gets.
    const [open] = await stepAsks(customer.customerId, 'layout');
    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      open?.id,
      new Date(NOON.getTime() - 5 * 86_400_000),
    ]);
    await queueActionReminders(acceptanceDb().db, NOON, 'Asia/Kolkata');
    expect(
      (await outboxFor(customer.phone)).filter((row) =>
        row.dedupe_key.startsWith('action_reminder:'),
      ),
    ).toHaveLength(0);
    expect(
      await rows('SELECT 1 FROM notifications WHERE dedupe_key LIKE $1', [
        `action_waiting:${open?.id}%`,
      ]),
    ).toHaveLength(0);
    // After the answer they can still approve it.
    const [ask] = await stepAsks(customer.customerId, 'layout');
    await tap(customer.phone, `stp:ok:${ask?.id}`);
    expect((await stepAsks(customer.customerId, 'layout'))[0]?.status).toBe('closed');
  });

  it('with the chat closed the approved template carries the layout; the 2-day reminder shows it again; cancel tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Layout Shut (test)' });
    const taskId = await setNotify(sale, 'system_design', true);
    await addPaper(admin, sale, 'commissioning_handover', 'Panel layout (test)');
    await closeChat(sale.customer.phone);
    const [offer] = await offerOf(admin, { taskId, projectId: sale.project.id }, 'send_layout');
    if (!offer?.request) throw new Error('No layout offer.');
    expect((await sendTo(admin, { taskId }, offer.request)).via).toBe('template');
    const [row] = (await outboxFor(sale.customer.phone)).filter(
      (one) => one.template === 'layout_approval',
    );
    const [ask] = await stepAsks(sale.customer.customerId, 'layout');
    expect(row?.payload).toMatchObject({
      okPayload: `stp:ok:${ask?.id}`,
      questionPayload: `stp:alt:${ask?.id}`,
    });
    expect(row?.payload.documentUrl).toMatch(/^https?:\/\//);

    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(NOON.getTime() - 2.5 * 86_400_000),
    ]);
    await queueActionReminders(acceptanceDb().db, NOON, 'Asia/Kolkata');
    const [reminder] = (await outboxFor(sale.customer.phone)).filter(
      (one) => one.template === 'layout_reminder' && one.dedupe_key.startsWith('action_reminder:'),
    );
    expect(reminder?.payload).toMatchObject({
      showPayload: `jr:${ask?.id}`,
    });
    // The reminder's button opens the chat and shows the layout again with its two buttons.
    await tap(sale.customer.phone, reminder?.payload.showPayload ?? '');
    const [file, again] = (await replies(sale.customer.phone)).slice(-2);
    expect(file?.kind).toBe('document');
    expect(again?.buttons?.map((button) => button.title)).toEqual([
      'Looks good',
      'I have a question',
    ]);

    await admin.post(`/document-requests/${ask?.id}/cancel`);
    expect((await stepAsks(sale.customer.customerId, 'layout'))[0]?.status).toBe('cancelled');
    expect((await lastReply(sale.customer.phone))?.body).toMatch(
      /You do not need to look at that layout any more/,
    );
  });

  it('a design step that may not message customers offers nothing (PRD rule)', async () => {
    const sale = await sellProject(admin, { name: 'Layout Quiet (test)' });
    const taskId = await setNotify(sale, 'system_design', false);
    await addPaper(admin, sale, 'commissioning_handover', 'Panel layout (test)');
    await openChat(sale.customer.phone, sale.customer.customerId);
    expect(
      await offerOf(admin, { taskId, projectId: sale.project.id }, 'send_layout'),
    ).toHaveLength(0);
    expect(await taskIdOf(sale, 'system_design')).toBe(taskId);
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId },
      request: {
        action: 'send_layout',
        paperId: 'document:00000000-0000-4000-8000-000000000000',
        taskId,
      },
    });
    expect(refused.status).toBe(400);
  });
});
