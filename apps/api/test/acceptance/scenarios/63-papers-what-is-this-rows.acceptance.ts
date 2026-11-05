import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queuePaymentReminders } from '../../../../worker/src/activities/payment-reminders';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { milestoneOf, recordPayment } from '../support/money';
import { choices, lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { advanceTo, project as projectOf } from '../support/tasks';
import {
  askAboutFiles,
  docsOf,
  photoAndQuestion,
  questions,
  sendPhoto,
} from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// The fixed rows of "What is this?": Payment proof (finance is asked to record it, reminders
// wait 2 days) and Problem photo (the problem flow, with the photo); the errors we say once;
// and a bill that is too old, asked for again when the DISCOM application starts.

const DAY = 86_400_000;
const payLinks = { secret: 'acceptance-pay-link-secret-00', days: 30 };

const milestoneRow = async (projectId: string, trigger: string) =>
  (
    await rows<{ id: string; paused: Date | null }>(
      `SELECT id, reminders_paused_until AS paused FROM payment_milestones
        WHERE project_id = $1 AND trigger = $2`,
      [projectId, trigger],
    )
  )[0];

describe('Papers: Payment proof, Problem photo, errors and old papers', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('Payment proof: kept as payment proof, finance alerted, reminders wait until it is recorded', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Paid Another Way (test)' });
    await photoAndQuestion(admin, customer.phone);
    const before = Date.now();
    await tap(customer.phone, 'what:pay');
    const [doc] = await docsOf(customer.customerId);
    expect(doc).toMatchObject({ category: 'payment_proof', project_id: project.id });
    const reply = await lastReply(customer.phone);
    expect(reply?.body).toBe("Thanks — we'll confirm your payment within 1 working day.");
    expect(reply?.buttons?.map((button) => button.title)).toEqual(['Menu']);
    const alerts = await rows<{ user_id: string; title: string }>(
      "SELECT user_id, title FROM notifications WHERE kind = 'payment_proof' AND subject_id = $1",
      [project.id],
    );
    expect(alerts.map((alert) => alert.title)).toEqual(
      alerts.map(() => 'Record payment: Paid Another Way (test) sent payment proof'),
    );
    expect(alerts.length).toBeGreaterThan(0);
    const due = await milestoneRow(project.id, 'quotation_accepted');
    expect(due?.paused?.getTime()).toBeGreaterThan(before + 1.9 * DAY);
    expect(due?.paused?.getTime()).toBeLessThan(before + 2.1 * DAY);
    // The reminder job leaves a paused instalment alone, and sends once the wait is over.
    await rows("UPDATE payment_milestones SET due_at = now() - interval '60 days' WHERE id = $1", [
      due?.id,
    ]);
    const db = acceptanceDb().db;
    await queuePaymentReminders(db, 'Asia/Kolkata', payLinks);
    const reminded = () =>
      rows("SELECT 1 FROM outbox WHERE template = 'payment_reminder' AND dedupe_key LIKE $1", [
        `payment_reminder:${due?.id}:%`,
      ]);
    expect(await reminded()).toHaveLength(0);
    // Finance records the payment: the wait ends with it.
    const detail = await projectOf(admin, project.id);
    await recordPayment(admin, project.id, milestoneOf(detail, 'quotation_accepted'), 'upi');
    expect((await milestoneRow(project.id, 'quotation_accepted'))?.paused).toBeNull();
  });

  it('a paused reminder goes out again after the 2 days', async () => {
    const { project } = await sellProject(admin, { name: 'Pause Over (test)' });
    const due = await milestoneRow(project.id, 'quotation_accepted');
    await rows(
      `UPDATE payment_milestones SET due_at = now() - interval '60 days',
        reminders_paused_until = now() - interval '1 hour' WHERE id = $1`,
      [due?.id],
    );
    const sent = await queuePaymentReminders(acceptanceDb().db, 'Asia/Kolkata', payLinks);
    expect(sent).toBeGreaterThanOrEqual(1);
  });

  it('Problem photo starts the problem flow with the photo (a home question for two homes)', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Problem Row (test)' });
    await photoAndQuestion(admin, customer.phone);
    await tap(customer.phone, 'what:prob');
    expect((await lastReply(customer.phone))?.body).toContain('What is wrong?');
    await tap(customer.phone, 'pb:what:inverter');
    await tap(customer.phone, 'pb:since:today');
    await tap(customer.phone, 'pb:done');
    const docs = await rows<{ id: string; request: string | null; project_id: string | null }>(
      `SELECT id, service_request_id AS request, project_id FROM documents WHERE customer_id = $1`,
      [customer.customerId],
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]?.request).not.toBeNull();
    expect(docs[0]?.project_id).toBe(project.id);

    const { customer: two } = await sellProject(admin, { name: 'Problem Two Homes (test)' });
    await anotherHome(admin, two, 'Farm (test)');
    await photoAndQuestion(admin, two.phone);
    await tap(two.phone, 'what:prob');
    const homes = await lastReply(two.phone);
    expect(choices(homes).every((id) => id.startsWith('home:'))).toBe(true);
    expect(choices(homes)).toHaveLength(2);
  });

  it('says once and truly what is wrong with a file', async () => {
    const { customer } = await sellProject(admin, { name: 'Bad Files (test)' });
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'sample-too-large' } });
    expect((await lastReply(customer.phone))?.body).toBe(
      'That file is too big (max 25 MB). Please send a photo or PDF.',
    );
    await sendInbound(customer.phone, { media: { type: 'document', fileId: 'sample-wrong-type' } });
    expect((await lastReply(customer.phone))?.body).toBe(
      "We can't open this kind of file. Please send a photo or PDF.",
    );
    await sendInbound(customer.phone, { media: { type: 'document', fileId: 'sample-empty' } });
    expect((await lastReply(customer.phone))?.body).toBe(
      'That file is empty. Please send it again.',
    );
    // None is waiting for a question.
    await askAboutFiles(admin);
    expect(await questions(customer.phone)).toHaveLength(0);
    expect((await replies(customer.phone)).filter((r) => r.body.includes('try'))).toHaveLength(0);
  });

  it('a bill older than 90 days shows missing; the DISCOM application asks for a new one', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Old Bill (test)' });
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    const bill = choices(await lastReply(customer.phone)).find((id) => id.includes(':bill'));
    await tap(customer.phone, bill ?? '');
    const itemOf = async () =>
      (
        await admin.get<{
          items: { key: string; status: string; tooOld: boolean; check: string }[];
        }>(`/projects/${project.id}/document-checklist`)
      ).items.find((item) => item.key === 'bill');
    expect(await itemOf()).toMatchObject({ status: 'present', tooOld: false });
    // Still waiting for the team's look: it counts. Once checked, an old one stops counting.
    expect(await itemOf()).toMatchObject({ status: 'present', tooOld: false });
    const [kept] = await rows<{ id: string }>('SELECT id FROM documents WHERE customer_id = $1', [
      customer.customerId,
    ]);
    await admin.post(`/documents/${kept?.id}/check`, {});
    await rows(
      "UPDATE documents SET created_at = now() - interval '100 days' WHERE customer_id = $1",
      [customer.customerId],
    );
    expect(await itemOf()).toMatchObject({ status: 'missing', tooOld: true, check: 'missing' });
    // The task starts: the stale bill is asked for again and the customer is told why.
    const task = await advanceTo(admin, project.id, 'discom_application');
    await admin.post(`/tasks/${task.id}/start`);
    const [ask] = await rows<{ status: string; title: string }>(
      `SELECT status::text AS status, title FROM customer_actions
        WHERE customer_id = $1 AND requirement_key = 'bill' AND status = 'open'`,
      [customer.customerId],
    );
    expect(ask?.status).toBe('open');
    const told = (await replies(customer.phone)).at(-1);
    expect(told?.body).toMatch(
      /^We need your latest electricity bill for .+\. The one we have is from /,
    );
    // Starting again asks nothing more.
    await admin.post(`/tasks/${task.id}/start`);
    const asks = await rows(
      "SELECT 1 FROM customer_actions WHERE customer_id = $1 AND requirement_key = 'bill'",
      [customer.customerId],
    );
    expect(asks).toHaveLength(1);
  });

  it('after the DISCOM application is done a bill never turns too old', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Applied Bill (test)' });
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    const bill = choices(await lastReply(customer.phone)).find((id) => id.includes(':bill'));
    await tap(customer.phone, bill ?? '');
    const [kept] = await rows<{ id: string }>('SELECT id FROM documents WHERE customer_id = $1', [
      customer.customerId,
    ]);
    await admin.post(`/documents/${kept?.id}/check`, {});
    await rows(
      "UPDATE documents SET created_at = now() - interval '100 days' WHERE customer_id = $1",
      [customer.customerId],
    );
    await rows(
      `UPDATE project_tasks SET status = 'completed' WHERE project_id = $1
        AND template_key = 'discom_application'`,
      [project.id],
    );
    const list = await admin.get<{ items: { key: string; status: string; tooOld: boolean }[] }>(
      `/projects/${project.id}/document-checklist`,
    );
    expect(list.items.find((item) => item.key === 'bill')).toMatchObject({
      status: 'present',
      tooOld: false,
    });
  });

  it('two starts of the DISCOM application at once ask for the old bill once', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Double Start (test)' });
    await sendPhoto(customer.phone);
    await askAboutFiles(admin);
    const bill = choices(await lastReply(customer.phone)).find((id) => id.includes(':bill'));
    await tap(customer.phone, bill ?? '');
    const [kept] = await rows<{ id: string }>('SELECT id FROM documents WHERE customer_id = $1', [
      customer.customerId,
    ]);
    await admin.post(`/documents/${kept?.id}/check`, {});
    await rows(
      "UPDATE documents SET created_at = now() - interval '100 days' WHERE customer_id = $1",
      [customer.customerId],
    );
    const task = await advanceTo(admin, project.id, 'discom_application');
    await Promise.allSettled([
      admin.post(`/tasks/${task.id}/start`),
      admin.post(`/tasks/${task.id}/start`),
    ]);
    const asks = await rows(
      "SELECT 1 FROM customer_actions WHERE customer_id = $1 AND requirement_key = 'bill'",
      [customer.customerId],
    );
    expect(asks).toHaveLength(1);
  });
});
