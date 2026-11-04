import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { choices, lastReply, replies, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { askAboutFiles, docsOf, questions, sendPhoto } from '../support/what-is-this';

// A burst is one question, 15 seconds after the last file; "They're different" asks about each
// file; [Change] takes a saved batch back; Menu or hello never drops a waiting file.

const actionOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [id],
    )
  )[0];

describe('Papers: a burst, Change, and files that wait', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const ask = (projectId: string, category: string, title: string, requirementKey: string) =>
    admin.post<{ id: string }>('/document-requests', {
      projectId,
      category,
      title,
      requirementKey,
    });

  it('three photos are one question, asked 15 seconds after the last', async () => {
    const { customer } = await sellProject(admin, { name: 'Burst Three (test)' });
    for (let n = 0; n < 3; n += 1) await sendPhoto(customer.phone);
    expect(await questions(customer.phone)).toHaveLength(0);
    // 10 seconds on: the last photo is too recent, nothing goes out.
    await askAboutFiles(admin, 10);
    expect(await questions(customer.phone)).toHaveLength(0);
    await askAboutFiles(admin, 30);
    const asked = await questions(customer.phone);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.body).toBe('Got your 3 photos ✅ What are they?');
    // "They're different" is offered for a burst, and only then.
    expect(choices(asked[0]).at(-1)).toBe('what:diff');
    // Asked once: running again says nothing more.
    await askAboutFiles(admin, 90);
    expect(await questions(customer.phone)).toHaveLength(1);
  });

  it('a burst of three answers one paper with one reply naming the count', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Burst Yes (test)' });
    const asked = await ask(project.id, 'customer_kyc', 'Aadhaar card (test)', 'kyc');
    for (let n = 0; n < 3; n += 1) await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    const question = await lastReply(customer.phone);
    expect(question?.body).toBe('Got your 3 photos ✅ Are they your *Aadhaar card (test)*?');
    expect(question?.buttons?.map((button) => button.title)).toEqual([
      'Yes',
      'Something else',
      "They're different",
    ]);
    const before = (await replies(customer.phone)).length;
    await tap(customer.phone, 'what:yes');
    const docs = await docsOf(customer.customerId);
    expect(docs).toHaveLength(3);
    expect(docs.every((doc) => doc.category === 'customer_kyc')).toBe(true);
    expect((await actionOf(asked.id))?.status).toBe('received');
    const after = (await replies(customer.phone)).slice(before);
    expect(after).toHaveLength(1);
    expect(after[0]?.body).toBe("Saved ✅ 3 files as *Aadhaar / PAN*. We'll check them.");
  });

  it("They're different: one question per file, one at a time", async () => {
    const { customer, project } = await sellProject(admin, { name: 'Each File (test)' });
    for (let n = 0; n < 3; n += 1) await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:diff');
    expect((await lastReply(customer.phone))?.body).toBe('File 1 of 3 — what is it?');
    await tap(customer.phone, 'what:other');
    expect((await replies(customer.phone)).at(-2)?.body).toContain('Saved ✅');
    expect((await lastReply(customer.phone))?.body).toBe('File 2 of 3 — what is it?');
    await tap(customer.phone, 'what:other');
    expect((await lastReply(customer.phone))?.body).toBe('File 3 of 3 — what is it?');
    await tap(customer.phone, 'what:other');
    const docs = await docsOf(customer.customerId);
    expect(docs.map((doc) => doc.project_id)).toEqual([project.id, project.id, project.id]);
    // All filed: nothing waits, a further tap says so.
    await tap(customer.phone, 'what:other');
    expect((await lastReply(customer.phone))?.body).toContain('already saved');
  });

  it('[Change] asks again and moves the same file; the request it answered is asked again quietly', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Change It (test)' });
    const bill = await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:yes');
    const [filed] = await docsOf(customer.customerId);
    expect((await actionOf(bill.id))?.status).toBe('received');
    const saved = await lastReply(customer.phone);
    const change = choices(saved).find((id) => id.startsWith('what:change:'));
    expect(change).toBe(`what:change:${filed?.id}`);
    const before = (await replies(customer.phone)).length;
    await tap(customer.phone, change ?? '');
    // The list again: the bill is asked for once more, and the customer is not told "send again".
    const list = await lastReply(customer.phone);
    expect(list?.body).toMatch(/^Is this your \*Electricity bill \(test\)\* for /);
    expect((await actionOf(bill.id))?.status).toBe('open');
    const sent = (await replies(customer.phone)).slice(before);
    expect(sent.every((reply) => !reply.body.includes('again'))).toBe(true);
    await tap(customer.phone, 'what:more');
    await tap(customer.phone, 'what:other');
    const docs = await docsOf(customer.customerId);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: filed?.id, category: 'other' });
    const audit = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'document.moved' AND entity_id = $1",
      [filed?.id],
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it('[Change] is refused once the team has checked the paper', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Change Late (test)' });
    await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:yes');
    const [filed] = await docsOf(customer.customerId);
    const change = choices(await lastReply(customer.phone)).find((id) =>
      id.startsWith('what:change:'),
    );
    await admin.post(`/documents/${filed?.id}/check`, {});
    await tap(customer.phone, change ?? '');
    expect((await lastReply(customer.phone))?.body).toBe(
      "We can't change that one here any more. Tell us and we'll fix it.",
    );
    expect((await docsOf(customer.customerId))[0]?.category).toBe('electricity_bill');
  });

  it('Menu or hello while files wait: Home says so first and [What are they?] asks again', async () => {
    const { customer } = await sellProject(admin, { name: 'Files Wait (test)' });
    await sendPhoto(customer.phone);
    await sendPhoto(customer.phone);
    await say(customer.phone, 'menu');
    const home = await lastReply(customer.phone);
    expect(home?.body.split('\n')[1]).toBe('You have 2 files not saved yet.');
    expect(home?.buttons?.[0]).toMatchObject({ id: 'what:ask', title: 'What are they?' });
    await tap(customer.phone, 'what:ask');
    expect((await lastReply(customer.phone))?.body).toBe('Got your 2 photos ✅ What are they?');
    await tap(customer.phone, 'what:other');
    await say(customer.phone, 'hello');
    expect((await lastReply(customer.phone))?.body).not.toContain('not saved yet');
  });

  it('a question tapped after 24 hours says it is old and asks again with the latest files', async () => {
    const { customer } = await sellProject(admin, { name: 'Old Question (test)' });
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await rows(
      `UPDATE wa_conversations SET context = jsonb_set(context, '{filesWait,askedAt}', to_jsonb($2::bigint))
        WHERE phone = $1`,
      [customer.phone, Date.now() - 25 * 3_600_000],
    );
    await tap(customer.phone, 'what:other');
    const sent = await replies(customer.phone);
    expect(sent.at(-2)?.body).toBe('That question is old — what are these files?');
    expect(sent.at(-1)?.body).toBe('What is this?');
    expect((await docsOf(customer.customerId))[0]?.category).toBe('other');
    // Nothing was filed by the old tap: the file still has no home.
    expect((await docsOf(customer.customerId))[0]?.project_id).toBeNull();
  });
});
