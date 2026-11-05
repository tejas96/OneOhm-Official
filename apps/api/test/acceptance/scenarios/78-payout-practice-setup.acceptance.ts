import type { BankPayout, PayoutOptions, PayoutSetup } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { billPostings, expectBalanced, feeBooks, postings } from '../support/money';
import { PayoutDesk } from '../support/payout-desk';
import { uniquePhone } from '../support/sales';

// Practice mode ends a payout through the real webhook code; the setup check shows values
// only; the fee estimate is empty until the owner enters a fee; the payee is told only
// while the message is switched on.
describe('Payout practice, setup check and payee message', () => {
  const desk = new PayoutDesk('Payout Practice Customer (test)', 910000);
  const { options, send, audits } = desk;
  let admin: Session;
  let accounts: Session;
  let crewPhone = '';
  let crewId = '';
  let templateSwitch: Record<string, unknown> = {};

  beforeAll(async () => {
    await desk.open();
    ({ admin, accounts } = desk);
    // The sale's own crew with a phone and bank details, so standing crews stay untouched.
    crewPhone = uniquePhone();
    const name = `Practice Crew ${crewPhone} (test)`;
    const crew = await admin.post<{ id: string }>('/contractors', {
      name,
      kind: 'company',
      phone: crewPhone,
      skills: ['ic_partner'],
      tdsBp: 100,
      retentionBp: 0,
      retentionDays: 90,
      paymentTermsDays: 15,
      bankAccountName: name,
      bankAccountNumber: '777788886666',
      bankAccountNumberConfirm: '777788886666',
      bankIfsc: 'HDFC0000001',
    });
    crewId = crew.id;
    await rows('update work_orders set contractor_id = $1 where id = $2', [crewId, desk.orderId]);
    const list = await admin.get<Record<string, unknown>[]>('/settings/message-templates');
    templateSwitch = list.find((one) => one.key === 'vendor_paid') ?? {};
  });
  afterAll(async () => {
    await admin.put('/settings/payments', { razorpayxFeePaise: null });
    await admin.put('/settings/message-templates/vendor_paid', {
      ...templateSwitch,
      active: false,
    });
    await desk.close();
    await closeDb();
  });

  const practice = (who: Session, payoutId: string, outcome: string) =>
    who.raw<BankPayout & { code?: string; message?: string }>(
      'POST',
      `/payouts/${payoutId}/practice`,
      { outcome },
    );
  const billStatus = async (id: string) =>
    (await admin.get<{ id: string; status: string }[]>('/finance/payables?status=all')).find(
      (p) => p.id === id,
    )?.status;
  const sendTo = async (billId: string) => (await send(admin, billId)).body;
  const setSwitch = (active: boolean) =>
    admin.put('/settings/message-templates/vendor_paid', { ...templateSwitch, active });
  const told = async () => (await outboxFor(crewPhone)).filter((m) => m.template === 'vendor_paid');

  it('has no fee estimate until a fee is entered, then shows the fee and 18% GST', async () => {
    const bill = await desk.newBill();
    expect((await options(admin, bill.id)).feeEstimate).toBeNull();
    expect(await admin.get('/settings/payments')).toMatchObject({
      razorpayxFeePaise: null,
      gstPercent: 18,
      gstPaise: null,
    });
    const refused = await admin.raw('PUT', '/settings/payments', { razorpayxFeePaise: -5 });
    expect(refused.status).toBe(400);
    expect(await admin.put('/settings/payments', { razorpayxFeePaise: 1000 })).toMatchObject({
      razorpayxFeePaise: 1000,
      gstPaise: 180,
    });
    const set = await options(admin, bill.id);
    expect(set.feeEstimate).toEqual({ feePaise: 1000, gstPaise: 180 });
    await admin.put('/settings/payments', { razorpayxFeePaise: null });
    expect((await options(admin, bill.id)).feeEstimate).toBeNull();
  });

  it('practice: processed pays the bill through the webhook path; the payee is not told while off', async () => {
    await setSwitch(false);
    const bill = await desk.newBill();
    const payout = await sendTo(bill.id);
    expect(payout).toMatchObject({ phase: 'on_its_way', payeeTold: null, lowBalance: false });
    // Only approvers may end a practice payout.
    expect((await practice(accounts, payout.id, 'processed')).status).toBe(403);
    const done = await practice(admin, payout.id, 'processed');
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      status: 'processed',
      phase: 'paid',
      feePaise: 590,
      payeeTold: 'off',
    });
    expect(done.body.utr).toMatch(/^PRACTICE/);
    expect(done.body.paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(done.body.payeeName).toContain('Practice Crew');
    expect(await billStatus(bill.id)).toBe('paid');
    expect(await billPostings(bill.id)).toBe(1);
    expect(await postings('payout_fee', payout.id)).toBe(1);
    // Like RazorpayX: ₹5.90 = ₹5.00 bank charge + ₹0.90 GST input credit.
    expect(await feeBooks(payout.id)).toEqual({ expense: 500, gstInput: 90, bank: -590 });
    expect((await audits('payable.paid', bill.id)).length).toBe(1);
    expect(await told()).toHaveLength(0);
    // A second ending changes nothing and is refused plainly.
    expect((await practice(admin, payout.id, 'failed')).status).toBe(409);
    await expectBalanced(admin);
  });

  it('practice: the payee is told once the message is switched on, with no full account number', async () => {
    await setSwitch(true);
    const bill = await desk.newBill();
    const payout = await sendTo(bill.id);
    const done = await practice(admin, payout.id, 'processed');
    expect(done.body.payeeTold).toBe('sent');
    const [message] = await told();
    expect(message).toMatchObject({ channel: 'whatsapp', recipient: crewPhone });
    expect(message?.payload).toMatchObject({
      company: expect.any(String),
      last4: '6666',
      utr: done.body.utr,
    });
    expect(JSON.stringify(message?.payload)).not.toContain('777788886666');
    // A payee with no phone cannot be told.
    await rows('update contractors set phone_e164 = null where id = $1', [crewId]);
    const next = await desk.newBill();
    const second = await sendTo(next.id);
    expect((await practice(admin, second.id, 'processed')).body.payeeTold).toBe('no_phone');
    await rows('update contractors set phone_e164 = $1 where id = $2', [crewPhone, crewId]);
    await setSwitch(false);
  });

  it('practice: failed leaves the bill to pay, and a low balance reason shows as lowBalance', async () => {
    const bill = await desk.newBill();
    const payout = await sendTo(bill.id);
    const failed = await practice(admin, payout.id, 'failed');
    expect(failed.body).toMatchObject({ status: 'failed', phase: 'failed', lowBalance: false });
    expect(failed.body.failureReason).toContain('Practice');
    expect(await billStatus(bill.id)).toBe('approved');
    expect((await audits('payout.practice', bill.id)).length).toBe(1);
    // Reversal needs a paid transfer first.
    expect((await practice(admin, payout.id, 'reversed')).status).toBe(409);
    await rows(`update bank_payouts set failure_code = 'insufficient_balance' where id = $1`, [
      payout.id,
    ]);
    const listed = (await admin.get<BankPayout[]>('/payouts')).find((p) => p.id === payout.id);
    expect(listed?.lowBalance).toBe(true);
    const setup = await admin.get<PayoutSetup>('/payouts/setup');
    expect(setup.lastLowBalanceAt).not.toBeNull();
  });

  it('practice: reversed puts the money back on the bill and gives the fee back', async () => {
    const bill = await desk.newBill();
    const payout = await sendTo(bill.id);
    await practice(admin, payout.id, 'processed');
    expect(await billStatus(bill.id)).toBe('paid');
    const back = await practice(admin, payout.id, 'reversed');
    expect(back.body).toMatchObject({ status: 'reversed', phase: 'came_back' });
    expect(await billStatus(bill.id)).toBe('approved');
    expect(await postings('payout_fee', payout.id)).toBe(1);
    expect(await postings('payout_fee_refund', payout.id)).toBe(1);
    expect(await feeBooks(payout.id)).toEqual({ expense: 0, gstInput: 0, bank: 0 });
    const latest: PayoutOptions = await options(admin, bill.id);
    expect(latest.problem).toBeNull();
    await expectBalanced(admin);
  });

  it('an old row with a leftover success text shows the plain reason', async () => {
    const payout = await sendTo((await desk.newBill()).id);
    await practice(admin, payout.id, 'failed');
    await rows('update bank_payouts set failure_reason = $1 where id = $2', [
      'Payout is processed and the money has been credited into the beneficiary account.',
      payout.id,
    ]);
    const shown = (await admin.get<BankPayout[]>('/payouts')).find((p) => p.id === payout.id);
    expect(shown?.failureReason).toBe(
      'The bank did not accept it. Check the bank details with the payee, then pay again.',
    );
  });

  it('the setup check shows what is set without any secret', async () => {
    const open = await desk.newBill();
    await sendTo(open.id);
    const setup = await admin.get<PayoutSetup>('/payouts/setup');
    expect(setup).toMatchObject({
      mode: 'sandbox',
      keysSet: false,
      keysAreTest: false,
      webhookSecretSet: true,
      lastCheckError: null,
    });
    expect(typeof setup.accountNumberSet).toBe('boolean');
    expect(setup.openPayouts).toBeGreaterThanOrEqual(1);
    expect(setup.stuckPayouts).toBe(0);
    expect(setup.lastGoodPayoutAt).not.toBeNull();
    expect(JSON.stringify(setup)).not.toContain('oneohm-acceptance-webhook-secret');
    // Finance people who only record payments may look too.
    expect((await accounts.raw('GET', '/payouts/setup')).status).toBe(200);
    await rows(
      `update bank_payouts set created_at = now() - interval '2 hours' where payable_id = $1`,
      [open.id],
    );
    expect((await admin.get<PayoutSetup>('/payouts/setup')).stuckPayouts).toBeGreaterThanOrEqual(1);
  });

  it('practice mode has no server IP, is not blocked, and matches itself', async () => {
    const setup = await admin.get<PayoutSetup & { serverIp: string | null; ipBlocked: boolean }>(
      '/payouts/setup',
    );
    expect(setup.serverIp).toBeNull();
    expect(setup.ipBlocked).toBe(false);
    const report = await admin.get<{ practice: boolean; lines: unknown[]; matched: number }>(
      '/payouts/match?days=30',
    );
    expect(report.practice).toBe(true);
    expect(report.lines).toEqual([]);
    expect(report.matched).toBeGreaterThanOrEqual(1);
    expect((await accounts.raw('GET', '/payouts/match')).status).toBe(200);
  });

  it('bank-hold alerts open the payee page', async () => {
    await admin.patch(`/contractors/${crewId}`, {
      bankAccountNumber: '555566667777',
      bankAccountNumberConfirm: '555566667777',
    });
    const [alert] = await rows<{ subject_type: string; subject_id: string }>(
      `select subject_type, subject_id from notifications
        where kind = 'payee_bank_changed' and subject_id = $1`,
      [crewId],
    );
    expect(alert).toMatchObject({ subject_type: 'contractor', subject_id: crewId });
  });
});
