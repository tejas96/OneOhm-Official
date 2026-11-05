import type { BankPayout, Payable, PayoutOptions } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  billPaidOut,
  billPostings,
  expectBalanced,
  providerId,
  signedWebhook,
} from '../support/money';
import { type Sale, sellProject, today } from '../support/sales';

// Bills can be paid in parts, by hand or by bank: the bill is paid only when nothing is
// left, each part is booked on its own, and a returned part gives back only that part.
describe('Part payments on bills', () => {
  let admin: Session;
  let sale: Sale;
  let orderId = '';
  let orderNumber = '';
  const used = new Set<string>();
  let amount = 520_000;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Part Payments Customer (test)' });
    const [order] = await admin.get<{ id: string; number: string }[]>(
      `/work-orders?projectId=${sale.project.id}`,
    );
    orderId = order?.id ?? '';
    orderNumber = order?.number ?? '';
  });
  afterAll(closeDb);

  /** A fresh approved crew-advance bill that can go by bank. */
  async function newBill(): Promise<{ id: string; amount: number }> {
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
    return { id: bill?.id ?? '', amount };
  }

  const billOf = async (id: string) =>
    (await admin.get<Payable[]>('/finance/payables?status=all')).find((p) => p.id === id);
  const event = (name: string, entity: Record<string, unknown>) =>
    signedWebhook({ event: `payout.${name}`, payload: { payout: { entity } } });
  const pay = (id: string, body: Record<string, unknown>) =>
    admin.raw('POST', `/finance/payables/${id}/pay`, { method: 'cash', paidOn: today(), ...body });

  it('records a bill paid by hand in two parts, and is paid only at the end', async () => {
    const bill = await newBill();
    expect((await pay(bill.id, { amountPaise: 50 })).status, 'under ₹1').toBe(400);
    expect((await pay(bill.id, { amountPaise: bill.amount + 100 })).status, 'over left').toBe(400);
    expect((await pay(bill.id, { amountPaise: 150_000 })).status).toBe(200);
    const part = await billOf(bill.id);
    expect(part).toMatchObject({
      status: 'approved',
      paidPaise: 150_000,
      leftPaise: bill.amount - 150_000,
      toPayPaise: bill.amount,
    });
    expect((await pay(bill.id, { amountPaise: bill.amount })).status, 'more than left').toBe(400);
    expect((await pay(bill.id, {})).status, 'all that is left').toBe(200);
    expect(await billOf(bill.id)).toMatchObject({
      status: 'paid',
      paidPaise: bill.amount,
      leftPaise: 0,
    });
    expect((await pay(bill.id, {})).status, 'nothing left').toBe(409);
    expect(await billPostings(bill.id)).toBe(2);
    expect(await billPaidOut(bill.id)).toBe(bill.amount);
    await expectBalanced(admin);
  });

  it('sends a part by bank; a processed part leaves the bill part paid, a returned part reopens only it', async () => {
    const bill = await newBill();
    const options = await admin.get<PayoutOptions>(`/payables/${bill.id}/payout-options`);
    expect(options).toMatchObject({ leftPaise: bill.amount, amountPaise: bill.amount });
    const tooMuch = await admin.raw('POST', `/payables/${bill.id}/payouts`, {
      amountPaise: bill.amount + 100,
    });
    expect(tooMuch.status).toBe(400);
    const first = await admin.post<BankPayout>(`/payables/${bill.id}/payouts`, {
      amountPaise: 200_000,
    });
    expect(first.amountPaise).toBe(200_000);
    const firstId = await providerId('bank_payouts', first.id);
    const done = await event('processed', { id: firstId, status: 'processed', utr: 'UTRPART1' });
    expect(done.outcome).toBe('processed');
    // A repeat of the same event never pays the part twice.
    await event('processed', { id: firstId, status: 'processed', utr: 'UTRPART1' });
    expect(await billOf(bill.id)).toMatchObject({
      status: 'approved',
      paidPaise: 200_000,
      leftPaise: bill.amount - 200_000,
    });
    const next = await admin.get<PayoutOptions>(`/payables/${bill.id}/payout-options`);
    expect(next.leftPaise).toBe(bill.amount - 200_000);

    // The rest goes by bank too, so the bill is paid in two transfers.
    const second = await admin.post<BankPayout>(`/payables/${bill.id}/payouts`);
    expect(second.amountPaise).toBe(bill.amount - 200_000);
    const secondId = await providerId('bank_payouts', second.id);
    await event('processed', { id: secondId, status: 'processed', utr: 'UTRPART2' });
    expect(await billOf(bill.id)).toMatchObject({ status: 'paid', leftPaise: 0 });
    expect(await billPostings(bill.id)).toBe(2);

    // The first part comes back: only that part is given back, and the bill is open again.
    await event('reversed', { id: firstId, status: 'reversed' });
    expect(await billOf(bill.id)).toMatchObject({
      status: 'approved',
      paidPaise: bill.amount - 200_000,
      leftPaise: 200_000,
    });
    const [stand] = await rows<{ standing: string; reversed: string }>(
      `select count(*) filter (where reversed_at is null) as standing,
              count(*) filter (where reversed_at is not null) as reversed
         from payable_payments where payable_id = $1`,
      [bill.id],
    );
    expect(stand).toEqual({ standing: '1', reversed: '1' });
    const [mirror] = await rows<{ count: string }>(
      `select count(*) from journal_entries r join journal_entries o on o.id = r.reverses_entry_id
        where r.source_type = 'reversal' and o.source_id in
          (select id::text from payable_payments where payable_id = $1)`,
      [bill.id],
    );
    expect(Number(mirror?.count)).toBe(1);
    await expectBalanced(admin);
  });

  it('warns when a late bank part takes the bill past what it was owed', async () => {
    const bill = await newBill();
    const part = await admin.post<BankPayout>(`/payables/${bill.id}/payouts`, {
      amountPaise: 300_000,
    });
    const partId = await providerId('bank_payouts', part.id);
    await event('failed', { id: partId, status: 'failed' });
    expect((await pay(bill.id, {})).status).toBe(200);
    await event('processed', { id: partId, status: 'processed', utr: 'UTRPART3' });
    const alerts = await rows<{ title: string }>(
      `select title from notifications where subject_id = $1 and kind = 'payout_paid_twice'`,
      [bill.id],
    );
    expect(alerts[0]?.title).toContain('₹3,000 more than the bill');
    expect(await billOf(bill.id)).toMatchObject({ status: 'paid', leftPaise: 0 });
    expect(await billPostings(bill.id)).toBe(2);
    await expectBalanced(admin);
  });
});
