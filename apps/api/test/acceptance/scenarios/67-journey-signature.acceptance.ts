import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { addPaper, asksOf, setNotify } from '../support/journey-steps';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject, uniquePhone } from '../support/sales';
import { openChat, optionsOf, sendTo } from '../support/send';
import { project, taskByKey } from '../support/tasks';
import { askAboutFiles, sendPhoto } from '../support/what-is-this';

// Send for signature (redesign §4 Agreements, §18 10): the paper and "Please read your …", I agree is
// logged, the signed page is asked for and checked, and the handover task takes it as its signature.

async function sendForSignature(admin: Session, taskId: string) {
  const options = await optionsOf(admin, { taskId });
  const offer = options.offers.find((one) => one.action === 'send_signature');
  if (!offer?.request) throw new Error('No paper to send for signature.');
  return { offer, sent: await sendTo(admin, { taskId }, offer.request) };
}

describe('Journey: send for signature', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('agree is logged, the signed photo is checked, and the handover task takes it as its signature', async () => {
    const sale = await sellProject(admin, { name: 'Sign Journey (test)' });
    const { customer } = sale;
    const taskId = await setNotify(sale, 'handover', true);
    await addPaper(admin, sale, 'commissioning_handover', 'Net-metering agreement (test)');
    await openChat(customer.phone, customer.customerId);
    const before = taskByKey(await project(admin, sale.project.id), 'handover');
    expect(before.missingEvidence).toContain('signature');

    const { offer, sent } = await sendForSignature(admin, taskId);
    expect(offer.label).toMatch(/for signature$/);
    expect(offer.preview?.buttons).toEqual(['I agree', 'I have a question']);
    expect(sent.via).toBe('chat');
    const sent2 = await replies(customer.phone);
    const [file, ask] = sent2.slice(-2);
    expect(file?.kind).toBe('document');
    expect(ask?.body).toMatch(/^Please read your \*.*Net-metering agreem.*\* for .+\.$/);
    expect(ask?.buttons?.map((button) => button.title)).toEqual(['I agree', 'I have a question']);
    // The same paper is not asked twice at once.
    const again = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId },
      request: offer.request,
    });
    expect(again.status).toBe(409);

    await tap(customer.phone, ask?.buttons?.[0]?.id ?? '');
    const photo = await lastReply(customer.phone);
    expect(photo?.body).toMatch(/^Thank you ✅ We have noted that you agree\./);
    expect(photo?.buttons?.map((button) => button.title)).toEqual(['Send photo']);
    const [signature] = await asksOf(customer.customerId, 'signature');
    expect(signature?.status).toBe('open');
    expect(signature?.payload).toMatchObject({ agreedByPhone: customer.phone });
    expect(String(signature?.payload.agreedAt)).toMatch(/^20\d\d-/);
    const [log] = await rows<{ message: string }>(
      "SELECT message FROM project_activities WHERE project_id = $1 AND message LIKE '%agreed to%'",
      [sale.project.id],
    );
    expect(log?.message).toContain(customer.phone);
    const [audit] = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'customer_action.signature_agreed' AND entity_id = $1",
      [signature?.id],
    );
    expect(audit).toBeDefined();

    // [Send photo] is the Send-a-paper path of the signed copy; the chat takes the photo.
    const copyId = (photo?.buttons?.[0]?.id ?? '').replace('sendit:', '');
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    expect((await lastReply(customer.phone))?.body).toMatch(/^Is this your \*Signed .+\?$/);
    await tap(customer.phone, 'what:yes');
    const [copy] = await rows<{ status: string; document_id: string }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [copyId],
    );
    expect(copy?.status).toBe('received');
    expect((await asksOf(customer.customerId, 'signature'))[0]?.status).toBe('open');

    await admin.post(`/documents/${copy?.document_id}/check`);
    const [done] = await asksOf(customer.customerId, 'signature');
    expect(done?.status).toBe('closed');
    const [doc] = await rows<{ category: string; task_id: string | null }>(
      'SELECT category, task_id FROM documents WHERE id = $1',
      [copy?.document_id],
    );
    expect(doc).toEqual({ category: 'customer_signature', task_id: taskId });
    const after = taskByKey(await project(admin, sale.project.id), 'handover');
    expect(after.missingEvidence).not.toContain('signature');
  });

  it('only the customer own number agrees; a family number is told so and can talk to a person', async () => {
    const sale = await sellProject(admin, { name: 'Sign Family (test)' });
    const { customer } = sale;
    const taskId = await setNotify(sale, 'handover', true);
    await addPaper(admin, sale, 'commissioning_handover', 'Agreement for family (test)');
    await openChat(customer.phone, customer.customerId);
    const family = uniquePhone();
    await rows(
      "INSERT INTO customer_contacts (customer_id, name, phone_e164, relation) VALUES ($1, 'Family (test)', $2, 'son')",
      [customer.customerId, family],
    );
    await sendForSignature(admin, taskId);
    const ask = (await replies(customer.phone)).at(-1);
    await tap(family, ask?.buttons?.[0]?.id ?? '');
    const refusal = await lastReply(family);
    expect(refusal?.body).toBe("Only Sign's own number can agree to this.");
    expect(refusal?.buttons?.[0]?.id).toBe('go:talk');
    const [signature] = await asksOf(customer.customerId, 'signature');
    expect(signature?.payload.agreedAt).toBeUndefined();
    expect(signature?.status).toBe('open');
  });

  it('a question goes to a person with the paper named; cancel tells the customer and drops the copy', async () => {
    const sale = await sellProject(admin, { name: 'Sign Question (test)' });
    const { customer } = sale;
    const taskId = await setNotify(sale, 'handover', true);
    await addPaper(admin, sale, 'commissioning_handover', 'Agreement question (test)');
    await openChat(customer.phone, customer.customerId);
    await sendForSignature(admin, taskId);
    const ask = (await replies(customer.phone)).at(-1);
    await tap(customer.phone, ask?.buttons?.[1]?.id ?? '');
    const [alert] = await rows<{ body: string }>(
      "SELECT body FROM notifications WHERE kind = 'whatsapp_handover' AND body LIKE '%Question about the Agreement question%'",
    );
    expect(alert).toBeDefined();
    // Agree, then the team cancels: the signed copy ask is cancelled with it and the customer hears.
    await tap(customer.phone, ask?.buttons?.[0]?.id ?? '');
    const [signature] = await asksOf(customer.customerId, 'signature');
    await admin.post(`/document-requests/${signature?.id}/cancel`);
    expect((await asksOf(customer.customerId, 'signature'))[0]?.status).toBe('cancelled');
    const [copy] = await rows<{ status: string }>(
      "SELECT status::text AS status FROM customer_actions WHERE customer_id = $1 AND type = 'paper'",
      [customer.customerId],
    );
    expect(copy?.status).toBe('cancelled');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /You do not need to sign the .+ any more\./,
    );
  });

  it('a step whose template does not message customers sends nothing (PRD rule)', async () => {
    const sale = await sellProject(admin, { name: 'Sign Quiet (test)' });
    const taskId = await setNotify(sale, 'handover', false);
    await addPaper(admin, sale, 'commissioning_handover', 'Agreement quiet (test)');
    await openChat(sale.customer.phone, sale.customer.customerId);
    const options = await optionsOf(admin, { taskId });
    expect(options.offers.some((one) => one.action === 'send_signature')).toBe(false);
    const sent = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId },
      request: {
        action: 'send_signature',
        paperId: 'document:00000000-0000-4000-8000-000000000000',
        taskId,
      },
    });
    expect(sent.status).toBe(400);
  });
});
