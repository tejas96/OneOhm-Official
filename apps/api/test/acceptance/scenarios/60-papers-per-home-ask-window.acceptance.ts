import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor } from '../support/db';
import { Session } from '../support/http';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat, templatesFor } from '../support/send';

// "Ask for a paper" from the desk: inside the customer's 24-hour window it is a chat message with
// [Send it now] (the send-a-paper form); outside it, the approved request template.

describe('Papers per home: the ask follows the chat window', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const ask = (projectId: string, title: string) =>
    admin.post<{ id: string }>('/document-requests', {
      projectId,
      category: 'electricity_bill',
      title,
    });

  it('inside the window it is a chat message with Send it now, not the template', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Ask In Window (test)' });
    await openChat(customer.phone, customer.customerId);
    const asked = await ask(project.id, 'Electricity bill (test)');
    expect(await templatesFor(customer.phone, 'document_requested')).toEqual([]);
    expect(await templatesFor(customer.phone, 'paper_request')).toEqual([]);
    const said = await lastReply(customer.phone);
    expect(said?.kind).toBe('buttons');
    expect(said?.body).toMatch(/^Please send your \*Electricity bill \(test\)\*/);
    expect(said?.buttons).toEqual([{ id: `sendit:${asked.id}`, title: 'Send it now' }]);
    const sent = (await outboxFor(customer.phone)).filter(
      (row) => row.dedupe_key === `document_requested:${asked.id}`,
    );
    expect(sent).toHaveLength(1);
    // The button works like the one under a reminder (the form, else the plain ask).
    const before = (await replies(customer.phone)).length;
    await tap(customer.phone, `sendit:${asked.id}`);
    expect((await replies(customer.phone)).length).toBeGreaterThan(before);
  });

  it('in Marathi inside the window the words and the button are Marathi', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Ask Marathi (test)' });
    await openChat(customer.phone, customer.customerId);
    await tap(customer.phone, 'lang:mr');
    await ask(project.id, 'वीज बिल (test)');
    const said = await lastReply(customer.phone);
    expect(said?.body).toContain('वीज बिल (test)');
    expect(said?.buttons).toHaveLength(1);
    expect(said?.buttons?.[0]?.title).not.toBe('Send it now');
  });

  it('outside the window the template goes, as before', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Ask Closed (test)' });
    await openChat(customer.phone, customer.customerId);
    await closeChat(customer.phone);
    const asked = await ask(project.id, 'Electricity bill (test)');
    const sent = await templatesFor(customer.phone);
    expect(sent.map((row) => row.dedupe_key)).toContain(`document_requested:${asked.id}`);
    expect(
      (await replies(customer.phone)).some((r) => r.buttons?.[0]?.id === `sendit:${asked.id}`),
    ).toBe(false);
  });
});
