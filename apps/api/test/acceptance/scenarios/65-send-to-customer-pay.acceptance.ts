import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { flowOf, photo } from '../support/forms';
import { Session } from '../support/http';
import { milestoneOf, recordPayment } from '../support/money';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import {
  actionsOf,
  closeChat,
  lastOf,
  openChat,
  optionsOf,
  sendTo,
  setForm,
  templatesFor,
} from '../support/send';
import { project as projectOf } from '../support/tasks';
import { docsOf } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// Payment reminder, ask for proof, receipt, and "I paid another way" (redesign §10, §18): the proof
// form (amount, day, photo) files a payment proof, alerts finance, pauses the reminders for 2 days
// and waits as a "To check" action until finance records the payment, which closes it.

const FLOW = '770011223344';
const DAY = 86_400_000;

describe('Send to customer: payments', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    await setForm('paid_another_way', FLOW);
  });
  afterAll(async () => {
    await setForm('paid_another_way', null);
    await closeDb();
  });

  const due = async (name: string) => {
    const sale = await sellProject(admin, { name });
    await openChat(sale.customer.phone, sale.customer.customerId);
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    return { sale, advance, scope: { projectId: sale.project.id } };
  };

  it('Payments carries [Pay ₹X] [Receipts] [I paid another way]', async () => {
    const { sale } = await due('Pay Buttons (test)');
    await sendInbound(sale.customer.phone, { text: 'payments' });
    const reply = await lastReply(sale.customer.phone);
    expect(reply?.buttons?.map((button) => button.title)).toEqual([
      expect.stringMatching(/^Pay ₹/),
      'Receipts',
      'I paid another way',
    ]);
    expect(reply?.buttons?.[2]?.id).toMatch(/^paidother:/);
  });

  it('a reminder inside 24 hours is [Pay] [I paid another way]; it is a pay action; resending reuses it', async () => {
    const { sale, advance, scope } = await due('Reminder Chat (test)');
    const offers = (await optionsOf(admin, scope)).offers.filter(
      (o) => o.action === 'payment_reminder',
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]?.preview?.body).toMatch(/^\*₹.+\* is due for your .+ home\.$/);
    expect(offers[0]?.preview?.buttons).toEqual([
      expect.stringMatching(/^Pay ₹/),
      'I paid another way',
    ]);
    const request = { action: 'payment_reminder', milestoneId: advance.id } as const;
    const first = await sendTo(admin, scope, request);
    const second = await sendTo(admin, scope, request);
    expect(second.actionId).toBe(first.actionId);
    expect(await actionsOf(sale.customer.customerId, 'pay')).toHaveLength(1);
    const sent = await lastOf(sale.customer.phone, 'buttons');
    expect(sent?.buttons?.map((b) => b.id)).toEqual([
      `pay:${advance.id}`,
      `paidother:${advance.id}`,
    ]);
  });

  it('outside 24 hours the payment_due template carries both quick-reply payloads', async () => {
    const { sale, advance, scope } = await due('Reminder Template (test)');
    await closeChat(sale.customer.phone);
    await sendTo(admin, scope, { action: 'ask_payment_proof', milestoneId: advance.id });
    const [message] = await templatesFor(sale.customer.phone, 'payment_due');
    expect(message?.payload).toMatchObject({
      payPayload: `pay:${advance.id}`,
      paidPayload: `paidother:${advance.id}`,
    });
    expect(message?.payload.amount).toMatch(/^₹/);
  });

  it('[I paid another way] opens the form; its reply files the proof, alerts finance, pauses reminders, waits for finance', async () => {
    const { sale, advance, scope } = await due('Proof Form (test)');
    const { actionId } = await sendTo(admin, scope, {
      action: 'ask_payment_proof',
      milestoneId: advance.id,
    });
    await tap(sale.customer.phone, `paidother:${advance.id}`);
    const flow = await flowOf(sale.customer.phone);
    expect(flow).toMatchObject({ flowId: FLOW, screen: 'PAID', button: 'Send payment proof' });
    expect(flow?.data.amount_hint).toMatch(/^Amount due: ₹/);
    const before = Date.now();
    await sendInbound(sale.customer.phone, {
      form: {
        token: flow?.token ?? '',
        photos: [photo('proof')],
        amount: '12,000',
        date: '2026-11-03',
      },
    });
    expect((await docsOf(sale.customer.customerId))[0]).toMatchObject({
      category: 'payment_proof',
      project_id: sale.project.id,
    });
    expect((await lastReply(sale.customer.phone))?.body).toBe(
      "Thanks — we'll confirm your payment within 1 working day.",
    );
    const [alert] = await rows<{ body: string }>(
      "SELECT body FROM notifications WHERE kind = 'payment_proof' AND subject_id = $1 LIMIT 1",
      [sale.project.id],
    );
    expect(alert?.body).toContain('₹12,000 on 2026-11-03');
    const [milestone] = await rows<{ paused: Date }>(
      'SELECT reminders_paused_until AS paused FROM payment_milestones WHERE id = $1',
      [advance.id],
    );
    expect(milestone?.paused.getTime()).toBeGreaterThan(before + 1.9 * DAY);
    const [action] = await actionsOf(sale.customer.customerId, 'pay');
    expect(action).toMatchObject({ id: actionId, status: 'received' });
    expect(action?.payload).toMatchObject({
      proof: { amountPaise: 1_200_000, paidOn: '2026-11-03' },
    });
    // The card shows it as "To check"; finance records the payment and it closes, the receipt goes.
    const card = await admin.get<{ id: string; type: string; status: string }[]>(
      `/document-requests?projectId=${sale.project.id}`,
    );
    expect(card.find((one) => one.id === actionId)).toMatchObject({
      type: 'pay',
      status: 'received',
    });
    await recordPayment(
      admin,
      sale.project.id,
      milestoneOf(await projectOf(admin, sale.project.id), 'quotation_accepted'),
      'upi',
    );
    expect((await actionsOf(sale.customer.customerId, 'pay'))[0]?.status).toBe('closed');
    expect(await templatesFor(sale.customer.phone, 'payment_received')).not.toHaveLength(0);
  });

  it('without a published form the chat asks for the proof photo; a used form is old', async () => {
    const { sale, advance, scope } = await due('Proof No Form (test)');
    await sendTo(admin, scope, { action: 'payment_reminder', milestoneId: advance.id });
    await setForm('paid_another_way', null);
    await tap(sale.customer.phone, `paidother:${advance.id}`);
    expect((await lastReply(sale.customer.phone))?.body).toMatch(
      /send a photo of the payment proof here/,
    );
    await setForm('paid_another_way', FLOW);
    // Once it is paid, the button says so.
    await recordPayment(
      admin,
      sale.project.id,
      milestoneOf(await projectOf(admin, sale.project.id), 'quotation_accepted'),
      'upi',
    );
    await tap(sale.customer.phone, `paidother:${advance.id}`);
    expect((await lastReply(sale.customer.phone))?.body).toMatch(/already done/);
  });

  it('send receipt: the PDF inside 24 hours, the payment_received template with the file outside', async () => {
    const { sale, scope } = await due('Receipt Again (test)');
    await recordPayment(
      admin,
      sale.project.id,
      milestoneOf(await projectOf(admin, sale.project.id), 'quotation_accepted'),
      'upi',
    );
    const offer = (await optionsOf(admin, scope)).offers.find(
      (one) => one.action === 'send_receipt',
    );
    expect(offer?.preview?.buttons).toEqual([]);
    if (!offer?.request) throw new Error('no receipt offer');
    await sendTo(admin, scope, offer.request);
    const doc = await lastOf(sale.customer.phone, 'document');
    expect(doc?.filename).toMatch(/receipt/i);
    await closeChat(sale.customer.phone);
    const before = (await templatesFor(sale.customer.phone, 'payment_received')).length;
    expect((await sendTo(admin, scope, offer.request)).via).toBe('template');
    const after = await templatesFor(sale.customer.phone, 'payment_received');
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)?.payload.documentUrl).toMatch(/\/v1\/files\/shared\//);
    expect((await replies(sale.customer.phone)).length).toBeGreaterThan(0);
  });
});
