import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { addPaper, setNotify } from '../support/journey-steps';
import { milestoneOf, recordPayment } from '../support/money';
import { lastReply, replies } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat } from '../support/send';
import { advanceTo, completeThrough, project } from '../support/tasks';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// Automatic messages carry buttons (redesign §19): switch-on has [Pay ₹X] when the final instalment
// is due, a wait on the customer links the open ask, a wait on the DISCOM is one info line, the
// handover pack goes when the handover is done. Only for steps whose template allows messages.

async function reachCommissioning(admin: Session, sale: Awaited<ReturnType<typeof sellProject>>) {
  const accounts = await Session.password(staffEmail('accounts'), TEAM_PASSWORD);
  await recordPayment(
    accounts,
    sale.project.id,
    milestoneOf(sale.project, 'quotation_accepted'),
    'bank_transfer',
  );
  await advanceTo(admin, sale.project.id, 'testing_commissioning');
  const detail = await project(admin, sale.project.id);
  await recordPayment(accounts, detail.id, milestoneOf(detail, 'material_dispatch'), 'upi');
}

describe('Journey: automatic messages with buttons', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('switch-on has [Pay ₹X] and [Warranty & AMC]; then the handover sends the pack by itself', {
    timeout: 240_000,
  }, async () => {
    const sale = await sellProject(admin, { name: 'Auto Switch On (test)' });
    const { customer } = sale;
    await reachCommissioning(admin, sale);
    await openChat(customer.phone, customer.customerId);
    await completeThrough(admin, sale.project.id, 'testing_commissioning');
    const detail = await project(admin, sale.project.id);
    const finalId = milestoneOf(detail, 'commissioning_completed').id;
    const message = await lastReply(customer.phone);
    expect(message?.body).toMatch(
      /^Your solar at .+ is ON ☀️\nThe final payment of \*₹[\d,]+\* is now due\.$/,
    );
    expect(message?.buttons?.map((button) => button.id)).toEqual([`pay:${finalId}`, 'go:warranty']);
    expect(message?.buttons?.[0]?.title).toMatch(/^Pay ₹[\d,]+$/);
    // The app inbox says it too, and no template went out while the window was open.
    const [notice] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'commissioning_completed'",
    );
    expect(notice).toBeDefined();
    expect(
      (await outboxFor(customer.phone)).some((row) => row.template === 'commissioning_completed'),
    ).toBe(false);

    await addPaper(admin, sale, 'warranty', 'Auto warranty card (test)');
    const before = (await replies(customer.phone)).length;
    await completeThrough(admin, sale.project.id, 'handover');
    const pack = (await replies(customer.phone))
      .slice(before)
      .filter((reply) => reply.kind === 'document' || reply.body?.includes('handover paper'));
    expect(pack.at(-1)?.kind).toBe('buttons');
    expect(pack.slice(0, -1).every((reply) => reply.kind === 'document')).toBe(true);
    expect(pack.length).toBeGreaterThanOrEqual(2);
    const [fact] = await rows(
      "SELECT 1 FROM project_facts WHERE project_id = $1 AND key = 'handover_pack_sent'",
      [sale.project.id],
    );
    expect(fact).toBeDefined();
  });

  it('the window closed sends the existing template, with the button payloads for its newer version', {
    timeout: 240_000,
  }, async () => {
    const sale = await sellProject(admin, { name: 'Auto Closed (test)' });
    await reachCommissioning(admin, sale);
    await closeChat(sale.customer.phone);
    await completeThrough(admin, sale.project.id, 'testing_commissioning');
    const [row] = (await outboxFor(sale.customer.phone)).filter(
      (one) => one.template === 'commissioning_completed',
    );
    expect(row?.payload.payPayload).toMatch(/^pay:/);
    expect(row?.payload.warrantyPayload).toBe('go:warranty');
  });

  it('a wait on the customer links the open ask; the DISCOM wait is one info line', async () => {
    const sale = await sellProject(admin, { name: 'Auto Waiting (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const ask = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });
    const survey = (await project(admin, sale.project.id)).tasks.find(
      (task) => task.templateKey === 'site_survey',
    );
    await rows('UPDATE project_tasks SET customer_visible = true WHERE id = $1', [survey?.id]);
    await rows('UPDATE customer_actions SET task_id = $2 WHERE id = $1', [ask.id, survey?.id]);
    await admin.post(`/tasks/${survey?.id}/waiting`, { party: 'customer', note: 'Bill (test)' });
    const linked = await lastReply(customer.phone);
    expect(linked?.body).toBe('We need *Electricity bill (test)* to continue.');
    expect(linked?.buttons).toEqual([{ id: `sendit:${ask.id}`, title: 'Send it now' }]);

    await admin.post(`/tasks/${survey?.id}/waiting`, { party: 'discom', note: 'Board (test)' });
    const info = await lastReply(customer.phone);
    expect(info?.kind).toBe('text');
    expect(info?.body).toMatch(
      /^Waiting for the electricity board since \d{1,2} \w+ \d{4}\. We'll update you\.$/,
    );
  });

  it('the window closed sends the existing template, with the link in its newer version button', async () => {
    const sale = await sellProject(admin, { name: 'Auto Waiting Closed (test)' });
    const { customer } = sale;
    await closeChat(customer.phone);
    const ask = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });
    const survey = (await project(admin, sale.project.id)).tasks.find(
      (task) => task.templateKey === 'site_survey',
    );
    await rows('UPDATE project_tasks SET customer_visible = true WHERE id = $1', [survey?.id]);
    // A step with no ask linked to it: the plain message, no button payload.
    const other = (await project(admin, sale.project.id)).tasks.find(
      (task) => task.templateKey === 'discom_application',
    );
    await rows('UPDATE project_tasks SET customer_visible = true WHERE id = $1', [other?.id]);
    await admin.post(`/tasks/${other?.id}/waiting`, { party: 'customer', note: 'Plain (test)' });
    await rows('UPDATE customer_actions SET task_id = $2 WHERE id = $1', [ask.id, survey?.id]);
    await admin.post(`/tasks/${survey?.id}/waiting`, { party: 'customer', note: 'Bill (test)' });
    const sent = (await outboxFor(customer.phone)).filter(
      (row) => row.template === 'project_waiting',
    );
    expect(sent).toHaveLength(2);
    expect(sent[0]?.payload.sendPayload).toBeUndefined();
    expect(sent[1]?.payload.sendPayload).toBe(`sendit:${ask.id}`);
  });

  it('a step that is not shown to the customer says nothing when it waits (PRD rule)', async () => {
    const sale = await sellProject(admin, { name: 'Auto Quiet (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    const survey = (await project(admin, sale.project.id)).tasks.find(
      (task) => task.templateKey === 'site_survey',
    );
    await rows('UPDATE project_tasks SET customer_visible = false WHERE id = $1', [survey?.id]);
    const before = (await replies(sale.customer.phone)).length;
    await admin.post(`/tasks/${survey?.id}/waiting`, { party: 'customer', note: 'Quiet (test)' });
    expect((await replies(sale.customer.phone)).length).toBe(before);
    expect(
      (await outboxFor(sale.customer.phone)).some((row) => row.template === 'project_waiting'),
    ).toBe(false);
    // And the handover pack waits for a template that allows messages.
    await setNotify(sale, 'handover', false);
  });
});
