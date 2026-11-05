import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { asksOf, setNotify } from '../support/journey-steps';
import { lastReply, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat } from '../support/send';
import { completeThrough } from '../support/tasks';

// Installation finished check (redesign §4 Installation, §18 14): asked when the installation task
// completes. Something is wrong starts a problem report on this home and tells the project manager.

describe('Journey: is the installation finished?', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('Yes, all good is logged and closes the question', async () => {
    const sale = await sellProject(admin, { name: 'Install Yes (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    await completeThrough(admin, sale.project.id, 'installation_complete');
    const question = await lastReply(customer.phone);
    expect(question?.body).toMatch(
      /^Is the installation at \*.+\* finished to your satisfaction\?$/,
    );
    expect(question?.buttons?.map((button) => button.title)).toEqual([
      'Yes, all good',
      'Something is wrong',
    ]);
    await tap(customer.phone, question?.buttons?.[0]?.id ?? '');
    expect((await asksOf(customer.customerId, 'confirm'))[0]).toMatchObject({ status: 'closed' });
    expect((await lastReply(customer.phone))?.body).toBe('Thank you ✅ We are glad it went well.');
    const [log] = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE '%confirmed the installation%'",
      [sale.project.id],
    );
    expect(log).toBeDefined();
  });

  it('Something is wrong tells the project manager and starts Report a problem for this home', async () => {
    const sale = await sellProject(admin, { name: 'Install Wrong (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    await completeThrough(admin, sale.project.id, 'installation_complete');
    const question = await lastReply(customer.phone);
    await tap(customer.phone, question?.buttons?.[1]?.id ?? '');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^We are sorry\. Please tell us what is wrong with the installation at /,
    );
    const [alert] = await rows<{ title: string }>(
      "SELECT title FROM notifications WHERE kind = 'installation_not_ok' AND user_id = $1 AND subject_id = $2",
      [admin.userId, sale.project.id],
    );
    expect(alert?.title).toMatch(/says the installation is not right/);
    expect((await asksOf(customer.customerId, 'confirm'))[0]?.payload.answer).toBe('problem');
    await say(customer.phone, 'One panel looks loose on the roof');
    const [request] = await rows<{ description: string; project_id: string }>(
      'SELECT description, project_id FROM service_requests WHERE customer_id = $1',
      [customer.customerId],
    );
    expect(request).toEqual({
      description: 'Installation: One panel looks loose on the roof (via WhatsApp)',
      project_id: sale.project.id,
    });
  });

  it('the window closed sends the approved template; a step that may not message sends nothing', async () => {
    const sale = await sellProject(admin, { name: 'Install Closed (test)' });
    await closeChat(sale.customer.phone);
    await completeThrough(admin, sale.project.id, 'installation_complete');
    const [template] = (await outboxFor(sale.customer.phone)).filter(
      (row) => row.template === 'installation_check',
    );
    expect(template?.payload.yesPayload).toMatch(/^ins:y:/);
    expect(template?.payload.wrongPayload).toMatch(/^ins:bad:/);

    const quiet = await sellProject(admin, { name: 'Install Quiet (test)' });
    await setNotify(quiet, 'installation_complete', false);
    await openChat(quiet.customer.phone, quiet.customer.customerId);
    await completeThrough(admin, quiet.project.id, 'installation_complete');
    // (The roof question of the dispatch step is its own; the installation has none.)
    const asks = await asksOf(quiet.customer.customerId, 'confirm');
    expect(asks.some((ask) => ask.payload.kind === 'installation')).toBe(false);
    expect(
      (await outboxFor(quiet.customer.phone)).some((row) => row.template === 'installation_check'),
    ).toBe(false);
  });
});
