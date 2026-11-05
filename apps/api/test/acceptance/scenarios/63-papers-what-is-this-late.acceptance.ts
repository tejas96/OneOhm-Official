import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ageRaisedProblem } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { choices, lastReply, replies, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { askAboutFiles, docsOf, questions, sendPhoto } from '../support/what-is-this';
import { refuseRepliesTo, sendInbound } from '../support/whatsapp';

// A file that arrives while a question is open waits for its own; an answer files only the
// files it was asked about. More than ten files are asked about ten at a time. A problem told
// a moment ago is offered, never taken silently. Home and the timer never both ask.

describe('Papers: late files, many files and the timer', () => {
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

  it('an answer files only the files it was asked about; the late one is asked next', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Late File (test)' });
    const bill = await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    await ask(project.id, 'property', 'Sale deed (test)', 'property');
    await sendPhoto(customer.phone);
    await askAboutFiles(admin, 20);
    await sendPhoto(customer.phone);
    await tap(customer.phone, `what:a:${bill.id}`);
    const docs = await docsOf(customer.customerId);
    expect(docs.map((doc) => doc.category)).toEqual(['electricity_bill', 'other']);
    expect(docs[1]?.project_id).toBeNull();
    await askAboutFiles(admin, 90);
    expect((await questions(customer.phone)).length).toBeGreaterThanOrEqual(2);
    expect((await lastReply(customer.phone))?.body).toMatch(/^Is this your \*Sale deed \(test\)\*/);
  });

  it('eleven files are asked about ten at a time and none is dropped', async () => {
    const { customer } = await sellProject(admin, { name: 'Eleven Files (test)' });
    for (let n = 0; n < 11; n += 1) await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    expect((await lastReply(customer.phone))?.body).toBe('Got your 10 photos ✅ What are they?');
    await tap(customer.phone, 'what:other');
    expect((await docsOf(customer.customerId)).filter((doc) => doc.project_id)).toHaveLength(10);
    await askAboutFiles(admin, 120);
    expect((await lastReply(customer.phone))?.body).toBe('What is this?');
    await tap(customer.phone, 'what:other');
    expect((await docsOf(customer.customerId)).filter((doc) => doc.project_id)).toHaveLength(11);
  });

  it('a photo after a problem is offered to it, never attached unasked', async () => {
    const { customer } = await sellProject(admin, { name: 'Problem Then Photo (test)' });
    await tap(customer.phone, 'go:problem');
    await tap(customer.phone, 'pb:what:inverter');
    await tap(customer.phone, 'pb:since:today');
    await tap(customer.phone, 'pb:done');
    // The first two minutes attach a photo by themselves; a photo later is asked about.
    await ageRaisedProblem(customer.phone, 300);
    await sendPhoto(customer.phone);
    const [kept] = await docsOf(customer.customerId);
    const request = () =>
      rows<{ request: string | null }>(
        'SELECT service_request_id AS request FROM documents WHERE id = $1',
        [kept?.id],
      );
    expect((await request())[0]?.request).toBeNull();
    await askAboutFiles(admin);
    const question = await lastReply(customer.phone);
    expect(question?.body).toBe('Is this a photo for the problem you told us about?');
    await tap(customer.phone, 'what:probadd');
    expect((await request())[0]?.request).not.toBeNull();
  });

  it('with a paper asked, the problem is a row of the list and the bill is not taken for it', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Bill After Problem (test)' });
    await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    await ask(project.id, 'property', 'Sale deed (test)', 'property');
    await tap(customer.phone, 'go:problem');
    await tap(customer.phone, 'pb:what:inverter');
    await tap(customer.phone, 'pb:since:today');
    await tap(customer.phone, 'pb:done');
    await ageRaisedProblem(customer.phone, 300);
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    expect(choices(await lastReply(customer.phone))[0]).toBe('what:probadd');
    const [kept] = await docsOf(customer.customerId);
    const [row] = await rows<{ request: string | null }>(
      'SELECT service_request_id AS request FROM documents WHERE id = $1',
      [kept?.id],
    );
    expect(row?.request).toBeNull();
  });

  it('Home with the files line is the only question: the timer stays quiet', async () => {
    const { customer } = await sellProject(admin, { name: 'Home First (test)' });
    await sendPhoto(customer.phone);
    await say(customer.phone, 'menu');
    expect((await lastReply(customer.phone))?.body).toContain('You have 1 file not saved yet.');
    const before = (await replies(customer.phone)).length;
    await askAboutFiles(admin);
    expect((await replies(customer.phone)).length).toBe(before);
    await tap(customer.phone, 'what:ask');
    expect((await lastReply(customer.phone))?.body).toBe('What is this?');
  });

  it('[Change] asks about the changed files on their own', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Change Alone (test)' });
    await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:yes');
    const change = choices(await lastReply(customer.phone)).find((id) =>
      id.startsWith('what:change:'),
    );
    await sendPhoto(customer.phone);
    await tap(customer.phone, change ?? '');
    expect((await lastReply(customer.phone))?.body).toMatch(/^Is this your \*Electricity bill/);
    await tap(customer.phone, 'what:yes');
    const docs = await docsOf(customer.customerId);
    // The other photo kept waiting; it was not filed with the changed one.
    expect(docs.map((doc) => doc.category).sort()).toEqual(['electricity_bill', 'other']);
    expect(docs.find((doc) => doc.category === 'other')?.project_id).toBeNull();
  });

  it('a Something else is sorted, so it is not left to sort', async () => {
    const { customer } = await sellProject(admin, { name: 'Sorted Else (test)' });
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:other');
    const [doc] = await rows<{ sorted: boolean }>(
      'SELECT sorted_at IS NOT NULL AS sorted FROM documents WHERE customer_id = $1',
      [customer.customerId],
    );
    expect(doc?.sorted).toBe(true);
  });

  it('a question that keeps failing is tried a few times, then staff are told once', async () => {
    const { customer } = await sellProject(admin, { name: 'Always Failing (test)' });
    await sendPhoto(customer.phone);
    const undo = await refuseRepliesTo(customer.phone);
    try {
      for (const later of [60, 300, 900, 1800, 3600, 7200]) await askAboutFiles(admin, later);
    } finally {
      await undo();
    }
    const [chat] = await rows<{ at: Date | null; tries: number }>(
      'SELECT files_ask_at AS at, files_ask_tries AS tries FROM wa_conversations WHERE phone = $1',
      [customer.phone],
    );
    expect(chat?.at).toBeNull();
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'whatsapp_file_failed' AND title = 'WhatsApp files not asked about'",
    );
    expect(alerts.length).toBeGreaterThan(0);
    // The file still waits: Home still says so.
    await say(customer.phone, 'menu');
    expect((await lastReply(customer.phone))?.body).toContain('not saved yet');
  });

  it('a PDF after a problem is not offered to it', async () => {
    const { customer } = await sellProject(admin, { name: 'Pdf After Problem (test)' });
    await tap(customer.phone, 'go:problem');
    await tap(customer.phone, 'pb:what:inverter');
    await tap(customer.phone, 'pb:since:today');
    await tap(customer.phone, 'pb:done');
    await sendInbound(customer.phone, {
      media: { type: 'document', fileId: 'pdf-after-problem', filename: 'bill.pdf' },
    });
    await askAboutFiles(admin);
    const question = await lastReply(customer.phone);
    expect(question?.body).toBe('What is this?');
    expect(choices(question)).not.toContain('what:probadd');
    // Even tapped by hand, nothing is dropped: the file is asked about again.
    await tap(customer.phone, 'what:probadd');
    expect((await lastReply(customer.phone))?.body).toBe('What is this?');
    await tap(customer.phone, 'what:other');
    expect((await docsOf(customer.customerId))[0]?.category).toBe('other');
  });

  it('one by one counts only its own files, not one that came later', async () => {
    const { customer } = await sellProject(admin, { name: 'Each Count (test)' });
    for (let n = 0; n < 3; n += 1) await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:diff');
    await tap(customer.phone, 'what:other');
    await sendPhoto(customer.phone);
    expect((await lastReply(customer.phone))?.body).toBe('File 2 of 3 — what is it?');
    await tap(customer.phone, 'what:other');
    expect((await lastReply(customer.phone))?.body).toBe('File 3 of 3 — what is it?');
    await tap(customer.phone, 'what:other');
    // The set is done; the late photo is asked about as its own question.
    await askAboutFiles(admin, 120);
    expect((await lastReply(customer.phone))?.body).toBe('What is this?');
  });

  it('files left behind a Problem photo are asked about after the problem is raised', async () => {
    const { customer } = await sellProject(admin, { name: 'Held Behind (test)' });
    await sendPhoto(customer.phone);
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:diff');
    await tap(customer.phone, 'what:prob');
    const before = (await replies(customer.phone)).length;
    // The problem steps are not cut across, however much time passes.
    await askAboutFiles(admin, 600);
    expect((await replies(customer.phone)).length).toBe(before);
    await tap(customer.phone, 'pb:what:inverter');
    await tap(customer.phone, 'pb:since:today');
    await tap(customer.phone, 'pb:done');
    await askAboutFiles(admin, 600);
    // Now it is asked about; the problem just told is offered for the photo.
    expect((await lastReply(customer.phone))?.body).toBe(
      'Is this a photo for the problem you told us about?',
    );
  });
});
