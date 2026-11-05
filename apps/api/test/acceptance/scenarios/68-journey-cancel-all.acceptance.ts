import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { cancelAllAsks } from '../../../src/modules/send-to-customer/send-cancel-all';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import {
  addPaper,
  asksOf,
  markDone,
  offerOf,
  saveLoan,
  setNotify,
  stepAsks,
  taskIdOf,
} from '../support/journey-steps';
import { lastReply, replies, tap } from '../support/onboarding';
import { addDays, newCustomer, sellProject, today } from '../support/sales';
import { openChat, sendTo } from '../support/send';
import { askDay, pickDay, setVisit, visitsFor } from '../support/visits';

// Cancel everything (redesign §2.2): a lost lead or a cancelled project closes every ask and visit
// there, and the customer hears ONCE.

describe('Journey: everything asked is cancelled when the lead is lost or the project cancelled', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const closedAll =
    /^We have closed everything we asked from you for .+\. You do not need to do anything more\./;

  it('a lost lead: asks and the confirmed visit are cancelled, one chat message and one inbox notice, nothing chased', async () => {
    const customer = await newCustomer(admin, { name: 'Cancel All Lead (test)' });
    await openChat(customer.phone, customer.customerId);
    const scope = { leadId: customer.leadId };
    await admin.post('/document-requests', {
      leadId: customer.leadId,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });
    await sendTo(admin, scope, { action: 'ask_location', propertyId: customer.propertyId });
    const { list } = await askDay(admin, { customer } as never, scope);
    const { day } = await pickDay(customer.phone, list, 'afternoon');
    await setVisit(admin, { leadId: customer.leadId, day, slot: 'afternoon' });
    expect((await visitsFor(customer.customerId))[0]?.status).toBe('confirmed');

    const before = (await replies(customer.phone)).length;
    await admin.patch(`/leads/${customer.leadId}`, { stage: 'lost', lostReasonKey: 'price' });
    const states = await rows<{ type: string; status: string }>(
      `SELECT type::text, status::text AS status FROM customer_actions
        WHERE customer_id = $1 AND type IN ('paper','location')`,
      [customer.customerId],
    );
    expect(states.map((one) => one.status)).toEqual(['cancelled', 'cancelled']);
    expect((await visitsFor(customer.customerId))[0]?.status).toBe('cancelled');
    // One message, however many asks: no per-ask or per-visit message.
    const said = (await replies(customer.phone)).slice(before);
    expect(said).toHaveLength(1);
    expect(said[0]?.body).toMatch(closedAll);
    const notices = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'action_cancelled' AND dedupe_key LIKE $1",
      [`notice:asks_cancelled:${customer.leadId}%`],
    );
    expect(notices).toHaveLength(1);
    const [line] = await rows<{ note: string }>(
      "SELECT note FROM lead_activities WHERE lead_id = $1 AND note LIKE 'Cancelled % customer requests (lead lost)'",
      [customer.leadId],
    );
    expect(line?.note).toMatch(/^Cancelled 3 customer requests/);
    // Nothing is chased on the next tick, and saving the lost lead again says nothing.
    const noon = new Date('2026-11-04T06:30:00Z');
    await rows('UPDATE customer_actions SET created_at = $2 WHERE customer_id = $1', [
      customer.customerId,
      new Date(noon.getTime() - 3 * 86_400_000),
    ]);
    await queueActionReminders(acceptanceDb().db, noon, 'Asia/Kolkata');
    expect(
      (await outboxFor(customer.phone)).filter((row) =>
        row.dedupe_key.startsWith('action_reminder:'),
      ),
    ).toHaveLength(0);
    await admin.patch(`/leads/${customer.leadId}`, { stage: 'lost', lostReasonKey: 'price' });
    expect((await replies(customer.phone)).length).toBe(before + 1);
  });

  it('a project scope settles a signature with its signed copy, a subsidy Not yet, a bank visit and a payment ask', {
    timeout: 120_000,
  }, async () => {
    const sale = await sellProject(admin, { name: 'Cancel All Project (test)', loan: true });
    const { customer, project } = sale;
    const handover = await setNotify(sale, 'handover', true);
    await addPaper(admin, sale, 'commissioning_handover', 'Agreement all (test)');
    await openChat(customer.phone, customer.customerId);
    const [sign] = await offerOf(admin, { taskId: handover }, 'send_signature');
    if (!sign?.request) throw new Error('No paper to sign.');
    await sendTo(admin, { taskId: handover }, sign.request);
    const [signAsk] = await asksOf(customer.customerId, 'signature');
    await tap(customer.phone, `sgn:ok:${signAsk?.id}`);
    const copyId = String(
      (await asksOf(customer.customerId, 'signature'))[0]?.payload.signedActionId,
    );

    const releaseId = await taskIdOf(sale, 'subsidy_release');
    await markDone(releaseId);
    const [credit] = await offerOf(
      admin,
      { taskId: releaseId, projectId: project.id },
      'ask_subsidy_credit',
    );
    if (!credit?.request) throw new Error('No credit offer.');
    await sendTo(admin, { taskId: releaseId }, credit.request);
    const [creditAsk] = await stepAsks(customer.customerId, 'subsidy_credit');
    await tap(customer.phone, `stp:alt:${creditAsk?.id}`);

    await saveLoan(admin, sale);
    await sendTo(
      admin,
      { projectId: project.id },
      {
        action: 'ask_bank_sign',
        projectId: project.id,
        branch: 'Sangli main branch',
        day: addDays(today(), 3),
      },
    );
    const [proof] = await offerOf(admin, { projectId: project.id }, 'ask_payment_proof');
    if (!proof?.request) throw new Error('No payment offer.');
    await sendTo(admin, { projectId: project.id }, proof.request);

    const before = (await replies(customer.phone)).length;
    const db = acceptanceDb().db;
    const count = await db.transaction((tx) =>
      cancelAllAsks(tx, { projectId: project.id }, admin.userId, 'project cancelled'),
    );
    expect(count).toBeGreaterThanOrEqual(5);
    const open = await rows(
      `SELECT type::text, status::text AS status FROM customer_actions
        WHERE project_id = $1 AND status IN ('open','received')`,
      [project.id],
    );
    expect(open).toHaveLength(0);
    const [copy] = await rows<{ status: string }>(
      'SELECT status::text AS status FROM customer_actions WHERE id = $1',
      [copyId],
    );
    expect(copy?.status).toBe('cancelled');
    const said = (await replies(customer.phone)).slice(before);
    expect(said).toHaveLength(1);
    expect(said[0]?.body).toMatch(closedAll);
    expect((await lastReply(customer.phone))?.kind).toBe('text');
    const [log] = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE 'Cancelled % customer requests (project cancelled)'",
      [project.id],
    );
    expect(log).toBeDefined();

    // The subsidy that "has not arrived" is not chased any more; saying it twice does nothing more.
    await rows(
      "UPDATE customer_actions SET payload = jsonb_set(payload, '{answeredAt}', to_jsonb($2::text)) WHERE id = $1",
      [creditAsk?.id, new Date(Date.now() - 30 * 86_400_000).toISOString()],
    );
    await queueActionReminders(db, new Date(), 'Asia/Kolkata');
    expect(
      await rows(
        "SELECT 1 FROM notifications WHERE kind = 'subsidy_not_received' AND dedupe_key LIKE $1",
        [`%${creditAsk?.id}%`],
      ),
    ).toHaveLength(0);
    expect(
      await db.transaction((tx) =>
        cancelAllAsks(tx, { projectId: project.id }, admin.userId, 'project cancelled'),
      ),
    ).toBe(0);
    expect((await replies(customer.phone)).length).toBe(before + 1);
  });

  it('with the chat closed (or after STOP) the customer hears in the app only', async () => {
    const customer = await newCustomer(admin, { name: 'Cancel All Shut (test)' });
    await admin.post('/document-requests', {
      leadId: customer.leadId,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });
    await admin.patch(`/leads/${customer.leadId}`, { stage: 'lost', lostReasonKey: 'price' });
    expect(await replies(customer.phone)).toHaveLength(0);
    const notices = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'action_cancelled' AND dedupe_key LIKE $1",
      [`notice:asks_cancelled:${customer.leadId}%`],
    );
    expect(notices).toHaveLength(1);
  });
});
