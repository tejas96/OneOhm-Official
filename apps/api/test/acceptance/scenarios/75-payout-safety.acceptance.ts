import type { BankPayout, Payable } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  billPostings,
  expectBalanced,
  feeBooks,
  postings,
  providerId,
  signedWebhook,
} from '../support/money';
import { type Sale, sellProject, today } from '../support/sales';

// RazorpayX bank payouts must never lose or double-book money: late "processed" wins,
// a reversal reopens the bill, the fee is booked once, and every alert opens the bill.
describe('Bank payout safety', () => {
  let admin: Session;
  let sale: Sale;
  let orderId = '';
  let orderNumber = '';
  const used = new Set<string>();
  let amount = 310_000;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Payout Safety Customer (test)' });
    const [order] = await admin.get<{ id: string; number: string }[]>(
      `/work-orders?projectId=${sale.project.id}`,
    );
    orderId = order?.id ?? '';
    orderNumber = order?.number ?? '';
  });
  afterAll(closeDb);

  /** A fresh approved crew-advance bill that can go by bank. */
  async function newBill(): Promise<string> {
    amount += 1_000;
    await admin.post(`/work-orders/${orderId}/advances`, { amountPaise: amount, note: 'Test' });
    const bills = await admin.get<Payable[]>('/finance/payables');
    const bill = bills.find(
      (p) =>
        p.description === `Advance · ${orderNumber}` && !used.has(p.id) && p.status === 'pending',
    );
    expect(bill, 'the advance raised a bill').toBeDefined();
    used.add(bill?.id ?? '');
    await admin.post(`/finance/payables/${bill?.id}/approve`);
    return bill?.id ?? '';
  }

  const send = (billId: string) => admin.post<BankPayout>(`/payables/${billId}/payouts`);
  const billOf = async (id: string) =>
    (await admin.get<Payable[]>('/finance/payables?status=all')).find((p) => p.id === id);
  const event = (name: string, entity: Record<string, unknown>) =>
    signedWebhook({ event: `payout.${name}`, payload: { payout: { entity } } });
  const alertsFor = (billId: string, kind: string) =>
    rows<{ title: string; subject_type: string }>(
      'select title, subject_type from notifications where subject_id = $1 and kind = $2',
      [billId, kind],
    );

  it('shows a plain phase and reopens a bill when the money comes back', async () => {
    const billId = await newBill();
    const payout = await send(billId);
    expect(payout).toMatchObject({ status: 'processing', phase: 'on_its_way' });
    const pid = await providerId('bank_payouts', payout.id);
    const processed = await event('processed', {
      id: pid,
      status: 'processed',
      utr: 'UTRSAFE1',
      fees: 590,
    });
    expect(processed.outcome).toBe('processed');
    expect((await billOf(billId))?.status).toBe('paid');
    const back = await event('reversed', {
      id: pid,
      status: 'reversed',
      status_details: { description: 'Account closed', reason: 'account_closed' },
    });
    expect(back.outcome).toBe('reversed');
    const bill = await billOf(billId);
    expect(bill?.status).toBe('approved');
    expect(bill?.paidReference ?? null).toBeNull();
    const [reversal] = await rows<{ count: string }>(
      `select count(*) from journal_entries r join journal_entries o on o.id = r.reverses_entry_id
       where r.source_type = 'reversal' and o.source_type = 'payable_payment'
         and o.source_id in (select id::text from payable_payments where payable_id = $1)`,
      [billId],
    );
    expect(Number(reversal?.count)).toBe(1);
    expect(await postings('payout_fee', payout.id)).toBe(1);
    // A late, out-of-order "processing" changes nothing.
    expect((await event('processing', { id: pid, status: 'processing' })).outcome).toBe('stale');
    const [alert] = await alertsFor(billId, 'payout_reversed');
    expect(alert).toMatchObject({ subject_type: 'payable' });
    expect(alert?.title).toContain('Money came back');
    await expectBalanced(admin);
  });

  it('pays the same bill again, found by our reference when the id is new', async () => {
    const billId = await newBill();
    const first = await send(billId);
    const firstId = await providerId('bank_payouts', first.id);
    await event('processed', { id: firstId, status: 'processed', utr: 'UTRSAFE2' });
    await event('reversed', { id: firstId, status: 'reversed' });
    const second = await send(billId);
    // As if the app crashed before it saved RazorpayX's id.
    await rows('update bank_payouts set provider_payout_id = null where id = $1', [second.id]);
    const hook = await event('processed', {
      id: 'pout_unsaved_by_us',
      reference_id: second.id,
      status: 'processed',
      utr: 'UTRSAFE3',
      fees: 118,
    });
    expect(hook.outcome).toBe('processed');
    expect((await billOf(billId))?.status).toBe('paid');
    expect(await providerId('bank_payouts', second.id)).toBe('pout_unsaved_by_us');
    const [made] = await rows<{ id: string }>(
      'select id from payable_payments where bank_payout_id = $1 and reversed_at is null',
      [second.id],
    );
    expect(await postings('payable_payment', made?.id ?? '')).toBe(1);
    expect(await postings('payout_fee', second.id)).toBe(1);
    await expectBalanced(admin);
  });

  it('lets a late "processed" win over our "failed", and warns when the bill was paid twice', async () => {
    const billId = await newBill();
    const payout = await send(billId);
    const pid = await providerId('bank_payouts', payout.id);
    await event('failed', { id: pid, status: 'failed', failure_reason: 'Bank down' });
    expect((await billOf(billId))?.status).toBe('approved');
    await event('processed', { id: pid, status: 'processed', utr: 'UTRSAFE4' });
    expect((await billOf(billId))?.status).toBe('paid');
    const [late] = await alertsFor(billId, 'payout_processed');
    expect(late?.title).toContain('after all');

    const twice = await newBill();
    const doomed = await send(twice);
    const doomedId = await providerId('bank_payouts', doomed.id);
    await event('failed', { id: doomedId, status: 'failed' });
    await admin.post(`/finance/payables/${twice}/pay`, { method: 'cash', paidOn: today() });
    await event('processed', { id: doomedId, status: 'processed', utr: 'UTRSAFE5' });
    const [warn] = await alertsFor(twice, 'payout_paid_twice');
    expect(warn?.title).toContain('more than the bill');
    // The manual payment and the late bank transfer are each booked once, under their own id.
    expect(await billPostings(twice)).toBe(2);
    expect((await billOf(twice))?.status).toBe('paid');
    await expectBalanced(admin);
  });

  /** A RazorpayX event with the real fee and GST (amount 10000, fees 236, tax 36). */
  const feeEvent = async (payoutId: string, status: string, extra: Record<string, unknown> = {}) =>
    signedWebhook({
      event: `payout.${status}`,
      payload: {
        payout: {
          entity: {
            id: (await providerId('bank_payouts', payoutId)) || `pout_fee_${payoutId.slice(0, 12)}`,
            reference_id: payoutId,
            status,
            fees: 236,
            tax: 36,
            ...extra,
          },
        },
      },
    });

  it('a fee with GST is booked split, and a failed payout ends with no net fee', async () => {
    const paid = await send(await newBill());
    await feeEvent(paid.id, 'processing');
    expect(await feeBooks(paid.id)).toEqual({ expense: 200, gstInput: 36, bank: -236 });
    await feeEvent(paid.id, 'processed', { utr: 'UTRFEE1' });
    expect(await feeBooks(paid.id)).toEqual({ expense: 200, gstInput: 36, bank: -236 });
    expect(
      (await admin.get<BankPayout[]>('/payouts')).find((row) => row.id === paid.id),
    ).toMatchObject({ feePaise: 236, feeTaxPaise: 36 });
    // Fee taken while processing, then the payout fails: the fee and GST come back.
    const failed = await send(await newBill());
    await feeEvent(failed.id, 'processing');
    expect((await feeBooks(failed.id)).expense).toBe(200);
    await feeEvent(failed.id, 'failed', { status_details: { description: 'Bank said no.' } });
    expect(await feeBooks(failed.id)).toEqual({ expense: 0, gstInput: 0, bank: 0 });
    expect(await postings('payout_fee_refund', failed.id)).toBe(1);
    // A repeat of the failure refunds nothing more.
    await feeEvent(failed.id, 'failed');
    expect(await postings('payout_fee_refund', failed.id)).toBe(1);
    // A payout that fails with a fee that was never booked leaves nothing in the books.
    const cold = await send(await newBill());
    await feeEvent(cold.id, 'failed');
    expect(await postings('payout_fee', cold.id)).toBe(0);
    expect(await postings('payout_fee_refund', cold.id)).toBe(0);
    await expectBalanced(admin);
  });

  it('paid then reversed: net fee is zero and the bill is open again', async () => {
    const bill = await newBill();
    const payout = await send(bill);
    await feeEvent(payout.id, 'processed', { utr: 'UTRFEE2' });
    expect((await billOf(bill))?.status).toBe('paid');
    await feeEvent(payout.id, 'reversed');
    expect((await billOf(bill))?.status).toBe('approved');
    expect(await feeBooks(payout.id)).toEqual({ expense: 0, gstInput: 0, bank: 0 });
    await expectBalanced(admin);
  });
});
