import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { asksOf, setNotify, taskRow } from '../support/journey-steps';
import { choices, lastReply, replies, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat, optionsOf, sendTo } from '../support/send';
import { advanceTo, completeThrough } from '../support/tasks';

// Site readiness before dispatch (redesign §4 Before dispatch, §18 13): the roof question goes by
// itself when dispatch becomes ready, and staff can send it. Not yet makes the step wait.

describe('Journey: is the roof ready?', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('goes by itself when dispatch is ready; Not yet waits the step, Home shows it, It is ready now reopens it', async () => {
    const sale = await sellProject(admin, { name: 'Roof Journey (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const dispatch = await advanceTo(admin, sale.project.id, 'dispatch_material');
    const [ask] = await asksOf(customer.customerId, 'confirm');
    expect(ask).toMatchObject({ status: 'open', task_id: dispatch.id });
    expect(ask?.payload).toMatchObject({ kind: 'site_ready' });
    const question = await lastReply(customer.phone);
    expect(question?.body).toMatch(/^Is the roof at \*.+\* ready for installation\?/);
    expect(question?.buttons?.map((button) => button.title)).toEqual(['Yes, ready', 'Not yet']);
    // Only one question per step, however often the step is ready.
    expect((await asksOf(customer.customerId, 'confirm')).length).toBe(1);

    await tap(customer.phone, question?.buttons?.[1]?.id ?? '');
    const waiting = await taskRow(dispatch.id);
    expect(waiting).toMatchObject({ status: 'waiting', waiting_party: 'customer' });
    expect(waiting?.waiting_since).not.toBeNull();
    const reply = await lastReply(customer.phone);
    expect(reply?.buttons?.map((button) => button.title)).toEqual(["It's ready now"]);
    expect((await asksOf(customer.customerId, 'confirm'))[0]?.status).toBe('open');
    const [alert] = await rows<{ title: string }>(
      "SELECT title FROM notifications WHERE kind = 'site_not_ready' AND subject_id = $1",
      [dispatch.id],
    );
    expect(alert?.title).toMatch(/^Roof not ready at /);
    // A second Not yet changes nothing more.
    await tap(customer.phone, question?.buttons?.[1]?.id ?? '');
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'site_not_ready' AND subject_id = $1",
      [dispatch.id],
    );
    expect(alerts.length).toBe(1);

    await say(customer.phone, 'hi');
    // The advance is also due, so Home says "2 things need you": the list has the roof row.
    await tap(customer.phone, 'go:see');
    expect(choices(await lastReply(customer.phone))).toContain(`rdy:now:${ask?.id}`);

    await tap(customer.phone, `rdy:now:${ask?.id}`);
    expect((await asksOf(customer.customerId, 'confirm'))[0]).toMatchObject({ status: 'closed' });
    expect((await taskRow(dispatch.id))?.status).toBe('ready');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^Thank you ✅ We have noted that the roof is ready\./,
    );
    const [now] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'site_ready_now' AND subject_id = $1",
      [dispatch.id],
    );
    expect(now).toBeDefined();
    const [wait] = await rows('SELECT 1 FROM task_waits WHERE task_id = $1', [dispatch.id]);
    expect(wait).toBeDefined();
  });

  it('Yes closes it with a log line; the window closed sends the approved template with its buttons', async () => {
    const sale = await sellProject(admin, { name: 'Roof Yes (test)' });
    const { customer } = sale;
    await closeChat(customer.phone);
    const dispatch = await advanceTo(admin, sale.project.id, 'dispatch_material');
    const [template] = (await outboxFor(customer.phone)).filter(
      (row) => row.template === 'site_ready_check',
    );
    expect(template?.payload.yesPayload).toMatch(/^rdy:y:/);
    expect(template?.payload.notYetPayload).toMatch(/^rdy:n:/);
    expect((await replies(customer.phone)).length).toBe(0);
    // The customer answers from the template: the tap opens the chat.
    await tap(customer.phone, template?.payload.yesPayload ?? '');
    const [ask] = await asksOf(customer.customerId, 'confirm');
    expect(ask).toMatchObject({ status: 'closed', task_id: dispatch.id });
    const [log] = await rows<{ message: string }>(
      "SELECT message FROM project_activities WHERE project_id = $1 AND message LIKE '%roof at%is ready%'",
      [sale.project.id],
    );
    expect(log).toBeDefined();
    expect((await taskRow(dispatch.id))?.status).toBe('ready');
  });

  it('staff can ask from the dispatch task; cancel tells the customer; a step that may not message sends nothing', async () => {
    const quiet = await sellProject(admin, { name: 'Roof Quiet (test)' });
    await setNotify(quiet, 'dispatch_material', false);
    await openChat(quiet.customer.phone, quiet.customer.customerId);
    await advanceTo(admin, quiet.project.id, 'dispatch_material');
    expect(await asksOf(quiet.customer.customerId, 'confirm')).toHaveLength(0);
    expect(
      (await outboxFor(quiet.customer.phone)).some((row) => row.template === 'site_ready_check'),
    ).toBe(false);

    const sale = await sellProject(admin, { name: 'Roof Staff (test)' });
    const { customer } = sale;
    await setNotify(sale, 'dispatch_material', false);
    const dispatch = await advanceTo(admin, sale.project.id, 'dispatch_material');
    expect(
      (await optionsOf(admin, { taskId: dispatch.id })).offers.some(
        (one) => one.action === 'ask_site_ready',
      ),
    ).toBe(false);
    await setNotify(sale, 'dispatch_material', true);
    await openChat(customer.phone, customer.customerId);
    const options = await optionsOf(admin, { taskId: dispatch.id });
    const offer = options.offers.find((one) => one.action === 'ask_site_ready');
    expect(offer?.preview?.buttons).toEqual(['Yes, ready', 'Not yet']);
    if (!offer?.request) throw new Error('No roof offer.');
    await sendTo(admin, { taskId: dispatch.id }, offer.request);
    const [ask] = await asksOf(customer.customerId, 'confirm');
    expect(ask?.status).toBe('open');
    // Asked again while it waits: refused.
    const wrong = await admin.raw('POST', '/send-to-customer', {
      scope: { projectId: sale.project.id },
      request: { action: 'ask_site_ready', taskId: dispatch.id },
    });
    expect(wrong.status).toBe(409);
    await admin.post(`/document-requests/${ask?.id}/cancel`);
    expect((await asksOf(customer.customerId, 'confirm'))[0]?.status).toBe('cancelled');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /You do not need to tell us about the roof any more/,
    );
  });

  async function notYet() {
    const sale = await sellProject(admin, { name: 'Roof Cancel (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const dispatch = await advanceTo(admin, sale.project.id, 'dispatch_material');
    const [ask] = await asksOf(customer.customerId, 'confirm');
    await tap(customer.phone, `rdy:n:${ask?.id}`);
    expect((await taskRow(dispatch.id))?.status).toBe('waiting');
    return { customer, dispatch, ask };
  }

  it('cancelling the ask after Not yet opens the step again; another wait is left alone', async () => {
    const { dispatch, ask } = await notYet();
    await admin.post(`/document-requests/${ask?.id}/cancel`);
    expect((await taskRow(dispatch.id))?.status).toBe('ready');

    const other = await notYet();
    await admin.post(`/tasks/${other.dispatch.id}/waiting`, {
      party: 'discom',
      note: 'Board (test)',
    });
    await admin.post(`/document-requests/${other.ask?.id}/cancel`);
    expect(await taskRow(other.dispatch.id)).toMatchObject({
      status: 'waiting',
      waiting_party: 'discom',
    });
  });

  it('an open roof ask closes quietly when the step is done: no Home line, no alert', async () => {
    const sale = await sellProject(admin, { name: 'Roof Stale (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const dispatch = await advanceTo(admin, sale.project.id, 'dispatch_material');
    const [ask] = await asksOf(customer.customerId, 'confirm');
    expect(ask?.status).toBe('open');
    await completeThrough(admin, sale.project.id, 'dispatch_material');
    const [closed] = await asksOf(customer.customerId, 'confirm');
    expect(closed).toMatchObject({ status: 'closed' });
    expect(closed?.payload.answer).toBe('step_done');
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE kind LIKE 'site_%' AND subject_id = $1",
      [dispatch.id],
    );
    expect(alerts).toHaveLength(0);
    await say(customer.phone, 'hi');
    const home = await lastReply(customer.phone);
    expect(choices(home).some((id) => id.startsWith('rdy:'))).toBe(false);
    // A late tap on the old question changes nothing and says so.
    await tap(customer.phone, `rdy:n:${ask?.id}`);
    expect((await lastReply(customer.phone))?.body).toBe(
      'That message is no longer open, so nothing has changed.',
    );
  });

  it('a wait on the customer names what is needed: your roof check, linked to the question', async () => {
    const sale = await sellProject(admin, { name: 'Roof Waiting (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const dispatch = await advanceTo(admin, sale.project.id, 'dispatch_material');
    const [ask] = await asksOf(customer.customerId, 'confirm');
    await admin.post(`/tasks/${dispatch.id}/waiting`, { party: 'customer', note: 'Roof (test)' });
    const need = await lastReply(customer.phone);
    expect(need?.body).toBe('We need *your roof check* to continue.');
    expect(need?.buttons).toEqual([{ id: `jr:${ask?.id}`, title: 'Answer now' }]);
    await tap(customer.phone, need?.buttons?.[0]?.id ?? '');
    expect((await lastReply(customer.phone))?.buttons?.map((button) => button.title)).toEqual([
      'Yes, ready',
      'Not yet',
    ]);
  });
});
