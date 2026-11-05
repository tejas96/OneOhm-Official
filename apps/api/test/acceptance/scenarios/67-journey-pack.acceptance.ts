import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { addPaper } from '../support/journey-steps';
import { replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat, optionsOf, sendTo } from '../support/send';

// Handover pack (redesign §4 Handover, §18 16): every handover paper as documents in one go, the
// summary line with [Documents] [Warranty & AMC], and the checklist fact "Handover pack sent".

describe('Journey: handover pack', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const packFact = (projectId: string) =>
    rows<{ value: string }>(
      "SELECT value FROM project_facts WHERE project_id = $1 AND key = 'handover_pack_sent'",
      [projectId],
    );
  const packOffer = async (projectId: string) =>
    (await optionsOf(admin, { projectId })).offers.find(
      (one) => one.action === 'send_handover_pack',
    );

  it('sends each paper then one summary line; the checklist row is set', async () => {
    const sale = await sellProject(admin, { name: 'Pack Journey (test)' });
    const { customer, project } = sale;
    // Nothing to send yet: no offer, and a send is refused.
    await openChat(customer.phone, customer.customerId);
    expect(await packOffer(project.id)).toBeUndefined();
    const empty = await admin.raw('POST', '/send-to-customer', {
      scope: { projectId: project.id },
      request: { action: 'send_handover_pack', projectId: project.id },
    });
    expect(empty.status).toBe(409);
    expect(await packFact(project.id)).toHaveLength(0);

    await addPaper(admin, sale, 'warranty', 'Panel warranty card (test)');
    await addPaper(admin, sale, 'commissioning_handover', 'Commissioning report (test)');
    await addPaper(admin, sale, 'product_manual', 'Inverter manual (test)');
    const before = (await replies(customer.phone)).length;
    const offer = await packOffer(project.id);
    expect(offer?.preview?.buttons).toEqual(['Documents', 'Warranty & AMC']);
    expect(offer?.detail).toBe('Not sent yet');
    if (!offer?.request) throw new Error('No pack offer.');
    const sent = await sendTo(admin, { projectId: project.id }, offer.request);
    expect(sent.via).toBe('chat');
    const after = (await replies(customer.phone)).slice(before);
    expect(after.map((reply) => reply.kind)).toEqual([
      'document',
      'document',
      'document',
      'buttons',
    ]);
    expect(
      after
        .slice(0, 3)
        .map((reply) => reply.caption)
        .sort(),
    ).toEqual([
      'Commissioning report (test).pdf',
      'Inverter manual (test).pdf',
      'Panel warranty card (test).pdf',
    ]);
    expect(after[3]?.body).toMatch(/^Your \*3\* handover papers for .+ are above\.$/);
    expect(after[3]?.buttons).toEqual([
      { id: 'go:documents', title: 'Documents' },
      { id: 'go:warranty', title: 'Warranty & AMC' },
    ]);
    expect((await packFact(project.id))[0]?.value).toMatch(/^20\d\d-\d\d-\d\d$/);
    expect((await packOffer(project.id))?.detail).toMatch(/^Sent on 20\d\d-\d\d-\d\d$/);
    const [log] = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE 'Sent the handover pack (3 papers)%'",
      [project.id],
    );
    expect(log).toBeDefined();
    const [audit] = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'customer.handover_pack_sent' AND entity_id = $1",
      [project.id],
    );
    expect(audit).toBeDefined();
  });

  it('with the chat closed the approved template goes, and its Documents button sends the papers', async () => {
    const sale = await sellProject(admin, { name: 'Pack Closed (test)' });
    const { customer, project } = sale;
    await addPaper(admin, sale, 'warranty', 'Closed warranty card (test)');
    await closeChat(customer.phone);
    const offer = await packOffer(project.id);
    expect(offer?.preview?.via).toBe('template');
    if (!offer?.request) throw new Error('No pack offer.');
    expect((await sendTo(admin, { projectId: project.id }, offer.request)).via).toBe('template');
    const [template] = (await outboxFor(customer.phone)).filter(
      (row) => row.template === 'handover_pack',
    );
    expect(template?.payload).toMatchObject({
      count: '1',
      documentsPayload: `hpack:${project.id}`,
      warrantyPayload: 'go:warranty',
    });
    expect(await replies(customer.phone)).toHaveLength(0);
    // The template is not switched on yet, so nothing really went: the checklist row is not set.
    expect(await packFact(project.id)).toHaveLength(0);
    expect((await packOffer(project.id))?.detail).toBe('Not sent yet');
    const [note] = await rows<{ message: string }>(
      "SELECT message FROM project_activities WHERE project_id = $1 AND message LIKE '%handover pack%'",
      [project.id],
    );
    expect(note?.message).toMatch(/\(not sent: the message is switched off\)$/);
    await tap(customer.phone, template?.payload.documentsPayload ?? '');
    const sent = await replies(customer.phone);
    expect(sent.map((reply) => reply.kind)).toEqual(['document', 'buttons']);
    expect(sent[1]?.body).toMatch(/^Your \*1\* handover paper for .+ is above\.$/);
  });
});
