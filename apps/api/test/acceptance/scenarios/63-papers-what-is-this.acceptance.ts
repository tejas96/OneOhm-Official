import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { choices, lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { askAboutFiles, docsOf, photoAndQuestion, sendPhoto } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// Papers, "first what, then where" (redesign 5.2): a photo never files itself. One paper asked:
// "Is this your ...?" Two or more: a list. Nothing asked: the missing checklist papers and the
// fixed rows. A home paper asks the home only when there are two or more; ID papers never.

const actionOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [id],
    )
  )[0];

describe('Papers: What is this?', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const ask = (projectId: string, category: string, title: string, requirementKey?: string) =>
    admin.post<{ id: string }>('/document-requests', {
      projectId,
      category,
      title,
      ...(requirementKey ? { requirementKey } : {}),
    });

  it('one paper asked: "Is this your ... for Sangli?" and Yes answers it', async () => {
    const { customer, project } = await sellProject(admin, { name: 'One Asked (test)' });
    const asked = await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    const question = await photoAndQuestion(admin, customer.phone);
    expect(question?.body).toMatch(/^Is this your \*Electricity bill \(test\)\* for .+\?$/);
    expect(question?.buttons?.map((button) => button.title)).toEqual(['Yes', 'Something else']);
    // Nothing is filed until the customer says so.
    expect((await actionOf(asked.id))?.status).toBe('open');
    await tap(customer.phone, 'what:yes');
    const [doc] = await docsOf(customer.customerId);
    expect(await actionOf(asked.id)).toEqual({ status: 'received', document_id: doc?.id });
    expect(doc).toMatchObject({
      category: 'electricity_bill',
      project_id: project.id,
      property_id: customer.propertyId,
    });
    const saved = await lastReply(customer.phone);
    expect(saved?.body).toMatch(/^Saved ✅ \*Electricity bill \(test\)\* · .+\. We'll check it\.$/);
    expect(saved?.buttons?.map((button) => button.title)).toEqual(['Change', 'Menu']);
  });

  it('Something else after the question opens the list without the asked paper', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Else Asked (test)' });
    const asked = await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    await photoAndQuestion(admin, customer.phone);
    await tap(customer.phone, 'what:more');
    const list = await lastReply(customer.phone);
    expect(choices(list)).toEqual(expect.arrayContaining(['what:pay', 'what:prob', 'what:other']));
    expect(choices(list).some((id) => id.startsWith('what:a:'))).toBe(false);
    await tap(customer.phone, 'what:other');
    const [doc] = await docsOf(customer.customerId);
    expect(doc).toMatchObject({ category: 'other', project_id: project.id });
    expect((await actionOf(asked.id))?.status).toBe('open');
  });

  it('two papers asked: a list of them, each with its home', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Two Asked (test)' });
    const bill = await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    const deed = await ask(project.id, 'property', 'Sale deed (test)', 'property');
    const question = await photoAndQuestion(admin, customer.phone);
    expect(question?.body).toBe('What is this?');
    expect(question?.rows?.map((row) => row.title)).toEqual([
      'Electricity bill (test)',
      'Sale deed (test)',
      'Something else',
    ]);
    expect(question?.rows?.[0]?.description).toBeTruthy();
    await tap(customer.phone, `what:a:${deed.id}`);
    expect((await actionOf(deed.id))?.status).toBe('received');
    expect((await actionOf(bill.id))?.status).toBe('open');
    // The home still waits for the bill: one line, one button, never a long list.
    const next = await lastReply(customer.phone);
    expect(next?.body).toBe('We still need your *Electricity bill (test)*.');
    expect(choices(next)).toEqual([`sendit:${bill.id}`]);
  });

  it('nothing asked: the missing checklist papers, then Payment proof, Problem photo, Something else', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Nothing Asked (test)' });
    const question = await photoAndQuestion(admin, customer.phone);
    const ids = choices(question);
    expect(ids.slice(-3)).toEqual(['what:pay', 'what:prob', 'what:other']);
    expect(ids.length).toBeLessThanOrEqual(10);
    expect(question?.rows?.map((row) => row.title)).toEqual(
      expect.arrayContaining(['Aadhaar / PAN', 'Electricity bill', 'Property papers']),
    );
    // A missing paper filed from the list lands on the home as that kind, unchecked.
    const bill = ids.find((id) => id.includes(':bill'));
    await tap(customer.phone, bill ?? '');
    const [doc] = await docsOf(customer.customerId);
    expect(doc).toMatchObject({ category: 'electricity_bill', project_id: project.id });
    const checklist = await admin.get<{ items: { key: string; check: string }[] }>(
      `/projects/${project.id}/document-checklist`,
    );
    expect(checklist.items.find((item) => item.key === 'bill')?.check).toBe('to_check');
  });

  it('an ID paper never asks the home, even with two homes', async () => {
    const { customer, project } = await sellProject(admin, { name: 'ID Two Homes (test)' });
    await anotherHome(admin, customer, 'Farm (test)');
    const id = await ask(project.id, 'customer_kyc', 'Aadhaar card (test)', 'kyc');
    const question = await photoAndQuestion(admin, customer.phone);
    expect(question?.body).toBe('Is this your *Aadhaar card (test)*?');
    await tap(customer.phone, 'what:yes');
    expect((await actionOf(id.id))?.status).toBe('received');
    expect((await lastReply(customer.phone))?.body).toBe(
      "Saved ✅ *Aadhaar / PAN*. We'll check it.",
    );
    expect(
      (await replies(customer.phone)).some((reply) => choices(reply)[0]?.startsWith('where:')),
    ).toBe(false);
  });

  it('two homes: a home paper asks "For which home?", with homes only', async () => {
    const { customer } = await sellProject(admin, { name: 'Which Home (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    await photoAndQuestion(admin, customer.phone);
    await tap(customer.phone, 'what:other');
    const list = await lastReply(customer.phone);
    expect(list?.body).toBe('For which home?');
    expect(choices(list)).toHaveLength(2);
    expect(choices(list).every((id) => id.startsWith('where:'))).toBe(true);
    expect(list?.rows?.map((row) => row.title)).toContain('Farm (test)');
    await tap(customer.phone, `where:${farm.propertyId}`);
    const [doc] = await docsOf(customer.customerId);
    expect(doc).toMatchObject({ category: 'other', property_id: farm.propertyId });
    expect((await lastReply(customer.phone))?.body).toContain('· Farm (test)');
  });

  it('a Word file is kept as Something else and never answers a paper', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Word File (test)' });
    const asked = await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    await sendInbound(customer.phone, {
      media: { type: 'document', fileId: 'word-1', filename: 'notes.docx' },
    });
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:yes');
    const [doc] = await docsOf(customer.customerId);
    expect(doc?.category).toBe('other');
    expect((await actionOf(asked.id))?.status).toBe('open');
  });

  it('a stale question: tapping a paper no longer asked says so and asks again', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Gone Paper (test)' });
    const one = await ask(project.id, 'electricity_bill', 'Electricity bill (test)', 'bill');
    await ask(project.id, 'property', 'Sale deed (test)', 'property');
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    await admin.post(`/document-requests/${one.id}/cancel`);
    await tap(customer.phone, `what:a:${one.id}`);
    const all = await replies(customer.phone);
    expect(all.at(-2)?.body).toContain('no longer needed');
    expect(all.at(-1)?.body).toMatch(/^Is this your \*Sale deed \(test\)\* for /);
  });
});
