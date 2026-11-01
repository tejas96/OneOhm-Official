import type {
  BankPayout,
  CashPosition,
  GatewaySettlement,
  HandledPayment,
  MoneyDeposit,
  Payable,
  PaymentLink,
  ReceivedPayment,
} from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  expectBalanced,
  milestoneOf,
  postings,
  providerId,
  recordPayment,
  signedWebhook,
} from '../support/money';
import { type Sale, sellProject, today } from '../support/sales';
import { project } from '../support/tasks';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// PRD 13 "Finance": every online, offline and bank collection and every payout is
// recorded and reconciled; the trial balance stays balanced.
const PART = 500_000; // ₹5,000 per offline collection
const tag = () => Math.random().toString(36).slice(2, 10);

describe('Finance', () => {
  let admin: Session;
  let accounts: Session;
  let a: Sale;
  let b: Sale;
  const paid: Record<string, string> = {};

  beforeAll(async () => {
    admin = await Session.admin();
    accounts = await Session.password(staffEmail('accounts'), TEAM_PASSWORD);
    a = await sellProject(admin, { name: 'Collections Customer (test)' });
    b = await sellProject(admin, { name: 'Online Customer (test)' });
  });
  afterAll(closeDb);

  const advanceOf = async (sale: Sale) =>
    milestoneOf(await project(admin, sale.project.id), 'quotation_accepted');
  const paymentsOf = async (sale: Sale) =>
    (await accounts.get<ReceivedPayment[]>('/finance/payments?limit=500')).filter(
      (payment) => payment.projectId === sale.project.id,
    );
  it('records cash, cheque, UPI and bank transfer, each with a receipt and a ledger entry', async () => {
    const advance = await advanceOf(a);
    const noNumber = await accounts.raw('POST', `/projects/${a.project.id}/payments`, {
      milestoneId: advance.id,
      amountPaise: PART,
      method: 'cheque',
      receivedOn: today(),
    });
    expect(noNumber.status).toBe(400);
    const cheque = {
      chequeNumber: '004512',
      chequeBank: 'Bank of Maharashtra (test)',
      chequeDate: today(),
    };
    for (const method of ['cash', 'cheque', 'upi', 'bank_transfer'] as const) {
      const extra = method === 'cheque' ? cheque : {};
      await recordPayment(accounts, a.project.id, advance, method, { amountPaise: PART, ...extra });
    }
    const payments = await paymentsOf(a);
    for (const payment of payments) {
      paid[payment.method] = payment.id;
      expect(payment.receiptNumber, payment.method).toBeTruthy();
      expect(await postings('payment', payment.id), payment.method).toBe(1);
    }
    expect(Object.keys(paid).sort()).toEqual(['bank_transfer', 'cash', 'cheque', 'upi']);
    const now = await advanceOf(a);
    expect(now.status).toBe('partly_paid');
    expect(now.paidPaise).toBe(4 * PART);
    const receipt = await accounts.download(`/finance/payments/${paid.cash}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.bytes.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('tracks the cash and the cheque until they are in the bank', async () => {
    const before = await accounts.get<CashPosition>('/finance/cash');
    const held = (position: CashPosition, id = '') => position.open.find((p) => p.paymentId === id);
    expect(held(before, paid.cash)?.status).toBe('in_hand');
    expect(held(before, paid.cheque)?.status).toBe('in_hand');
    const slip = await accounts.post<MoneyDeposit>('/finance/deposits', {
      depositedOn: today(),
      bankReference: `DEP-${tag()} (test)`,
      note: 'Counter deposit (test)',
      paymentIds: [paid.cash, paid.cheque],
    });
    expect(slip.cashPaise).toBe(PART);
    expect(slip.chequePaise).toBe(PART);
    expect(await postings('cash_deposit', slip.id)).toBe(1);
    const cleared = await accounts.post<HandledPayment>(`/finance/cheques/${paid.cheque}/clear`, {
      clearedOn: today(),
    });
    expect(cleared.status).toBe('cleared');
    expect(await postings('cheque_cleared', paid.cheque ?? '')).toBe(1);
    const after = await accounts.get<CashPosition>('/finance/cash');
    expect(held(after, paid.cash)).toBeUndefined();
    expect(held(after, paid.cheque)).toBeUndefined();
  });

  it('collects the rest online through a payment link (sandbox checkout)', async () => {
    const advance = await advanceOf(a);
    const link = await accounts.post<PaymentLink>(`/finance/milestones/${advance.id}/payment-link`);
    expect(link.sandbox).toBe(true);
    expect(link.amountPaise).toBe(advance.amountPaise - advance.paidPaise);
    const page = await fetch(link.url, { method: 'POST' });
    expect(page.ok).toBe(true);
    expect(await page.text()).toContain('Paid');
    expect((await advanceOf(a)).status).toBe('paid');
    const online = (await paymentsOf(a)).find((payment) => payment.method === 'razorpay');
    expect(online?.amountPaise).toBe(link.amountPaise);
    expect(await postings('payment', online?.id ?? '')).toBe(1);
    expect(await postings('gateway_fee', online?.id ?? '')).toBe(1);
  });

  it('records a signed Razorpay webhook payment once and refuses a forged one', async () => {
    const advance = await advanceOf(b);
    const link = await accounts.post<PaymentLink>(`/finance/milestones/${advance.id}/payment-link`);
    const event = {
      event: 'payment_link.paid',
      payload: {
        payment_link: { entity: { id: await providerId('payment_links', link.id) } },
        payment: {
          entity: { id: `pay_acc_${tag()}`, amount: link.amountPaise, fee: 2_000, created_at: 0 },
        },
      },
    };
    event.payload.payment.entity.created_at = Math.floor(Date.now() / 1000);
    expect((await signedWebhook(event, 'not-the-secret')).status).toBe(401);
    expect(await signedWebhook(event)).toEqual({ status: 200, outcome: 'recorded' });
    expect(await signedWebhook(event)).toEqual({ status: 200, outcome: 'already recorded' });
    expect((await advanceOf(b)).status).toBe('paid');
    const online = (await paymentsOf(b)).filter((payment) => payment.method === 'razorpay');
    expect(online).toHaveLength(1);
    expect(online[0]?.amountPaise).toBe(link.amountPaise);
  });

  it('reconciles the gateway settlement into the bank', async () => {
    const [net] = await rows<{ net: string }>(
      `select sum(amount_paise - coalesce(gateway_fee_paise, 0)) as net from payments
       where method = 'razorpay' and project_id = any($1)`,
      [[a.project.id, b.project.id]],
    );
    const id = `setl_acc_${tag()}`;
    const settled = await signedWebhook({
      event: 'settlement.processed',
      payload: {
        settlement: {
          entity: {
            id,
            amount: Number(net?.net),
            fees: 0,
            tax: 0,
            utr: `UTR${tag()}`,
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });
    expect(settled).toEqual({ status: 200, outcome: 'recorded' });
    const settlements = await accounts.get<GatewaySettlement[]>('/finance/settlements');
    const row = settlements.find((settlement) => settlement.providerSettlementId === id);
    expect(row?.amountPaise).toBe(Number(net?.net));
    expect(await postings('settlement', row?.id ?? '')).toBe(1);
  });

  it('pays a crew advance straight to its bank through RazorpayX (sandbox)', async () => {
    const [order] = await admin.get<{ id: string; number: string }[]>(
      `/work-orders?projectId=${a.project.id}`,
    );
    expect(order, 'the project has a work order').toBeDefined();
    await admin.post(`/work-orders/${order?.id}/advances`, {
      amountPaise: PART,
      note: 'Advance (test)',
    });
    const bills = await accounts.get<Payable[]>('/finance/payables');
    const bill = bills.find((p) => p.description === `Advance · ${order?.number}`);
    expect(bill?.status).toBe('pending');
    const approved = await admin.post<Payable>(`/finance/payables/${bill?.id}/approve`);
    expect(approved.status).toBe('approved');
    const options = await admin.get<{ mode: string; problem: string | null; amountPaise: number }>(
      `/payables/${bill?.id}/payout-options`,
    );
    expect(options).toMatchObject({ mode: 'sandbox', problem: null });
    const payout = await admin.post<BankPayout>(`/payables/${bill?.id}/payouts`);
    expect(payout).toMatchObject({ sandbox: true, status: 'processing' });
    const utr = `UTR${tag().toUpperCase()}`;
    const hook = await signedWebhook({
      event: 'payout.processed',
      payload: {
        payout: {
          entity: {
            id: await providerId('bank_payouts', payout.id),
            status: 'processed',
            utr,
            fees: 590,
          },
        },
      },
    });
    expect(hook).toEqual({ status: 200, outcome: 'processed' });
    const done = (await accounts.get<Payable[]>('/finance/payables?status=all')).find(
      (p) => p.id === bill?.id,
    );
    expect(done?.status).toBe('paid');
    expect(done?.paidReference).toContain(utr);
    expect(await postings('payable_paid', bill?.id ?? '')).toBe(1);
    expect(await postings('payout_fee', payout.id)).toBe(1);
  });

  it('records a bill paid outside OneOhm by bank transfer', async () => {
    const bill = await accounts.post<Payable>('/finance/payables', {
      projectId: a.project.id,
      party: 'vendor',
      partyName: 'Sangli Hardware (test)',
      description: 'Cable ties and lugs (test)',
      amountPaise: 250_000,
      dueOn: today(),
    });
    await admin.post(`/finance/payables/${bill.id}/approve`);
    const paidBill = await accounts.post<Payable>(`/finance/payables/${bill.id}/pay`, {
      method: 'bank_transfer',
      paidOn: today(),
      reference: `NEFT-${tag()} (test)`,
    });
    expect(paidBill.status).toBe('paid');
    expect(await postings('payable_paid', bill.id)).toBe(1);
  });

  it('keeps the books balanced: debits equal credits', async () => {
    const balance = await expectBalanced(accounts);
    expect(balance.entries).toBeGreaterThan(0);
  });
});
