import type { Payable, PayablePayment } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import type { Session } from '../support/http';
import { billPaidOut, billPostings, expectBalanced } from '../support/money';
import { PayoutDesk } from '../support/payout-desk';
import { today } from '../support/sales';

// A payment recorded by hand can be undone (who may, what it gives back, what it cannot
// touch), and a processed bank transfer has a payment advice PDF.
describe('Undo a hand-recorded payment, and the payment advice', () => {
  const desk = new PayoutDesk('Undo Payment Customer (test)', 810000);
  let admin: Session;
  let accounts: Session;

  beforeAll(async () => {
    await desk.open();
    ({ admin, accounts } = desk);
  });
  afterAll(async () => {
    await desk.close();
    await closeDb();
  });

  const billOf = async (id: string) =>
    (await admin.get<Payable[]>('/finance/payables?status=all')).find((p) => p.id === id);
  const payments = (id: string) => admin.get<PayablePayment[]>(`/payables/${id}/payments`);
  const record = (who: Session, id: string, body: Record<string, unknown> = {}) =>
    who.raw('POST', `/finance/payables/${id}/pay`, { method: 'cash', paidOn: today(), ...body });
  const undo = (who: Session, id: string, paymentId: string, reason = 'Entered by mistake') =>
    who.raw('POST', `/payables/${id}/payments/${paymentId}/undo`, { reason });

  it('undoes a part paid by hand: left is restored and the ledger balances', async () => {
    const bill = await desk.newBill();
    expect((await record(admin, bill.id, { amountPaise: 150_000 })).status).toBe(200);
    const [part] = await payments(bill.id);
    expect(part).toMatchObject({
      amountPaise: 150_000,
      bank: false,
      reversed: false,
      canUndo: true,
    });
    expect((await undo(admin, bill.id, part?.id ?? '', 'no')).status, 'reason too short').toBe(400);
    expect((await undo(admin, bill.id, part?.id ?? '')).status).toBe(200);
    expect(await billOf(bill.id)).toMatchObject({
      status: 'approved',
      paidPaise: 0,
      leftPaise: bill.amount,
    });
    const [after] = await payments(bill.id);
    expect(after).toMatchObject({
      reversed: true,
      reversalReason: 'Entered by mistake',
      canUndo: false,
    });
    expect((await undo(admin, bill.id, part?.id ?? '')).status, 'only once').toBe(409);
    expect(await billPaidOut(bill.id)).toBe(0);
    const audit = await rows(
      `select 1 from audit_log where action = 'payable.payment_undone' and entity_id = $1`,
      [bill.id],
    );
    expect(audit).toHaveLength(1);
    await expectBalanced(admin);
  });

  it('reopens a paid bill; the recorder may undo within 24 hours, others may not', async () => {
    const bill = await desk.newBill();
    expect((await record(accounts, bill.id)).status).toBe(200);
    expect(await billOf(bill.id)).toMatchObject({ status: 'paid', leftPaise: 0 });
    const [mine] = await accounts.get<PayablePayment[]>(`/payables/${bill.id}/payments`);
    expect(mine?.canUndo, 'the recorder').toBe(true);
    const second = await desk.newBill();
    expect((await record(admin, second.id)).status).toBe(200);
    const [theirs] = await accounts.get<PayablePayment[]>(`/payables/${second.id}/payments`);
    expect(theirs?.canUndo, 'someone else’s payment').toBe(false);
    expect((await undo(accounts, second.id, theirs?.id ?? '')).status).toBe(403);
    expect((await undo(accounts, bill.id, mine?.id ?? '')).status).toBe(200);
    expect(await billOf(bill.id)).toMatchObject({ status: 'approved', leftPaise: bill.amount });
    // Past 24 hours the recorder needs an approver.
    const [old] = await accounts.get<PayablePayment[]>(`/payables/${second.id}/payments`);
    await rows(
      `update payable_payments set paid_by_user_id = $1, created_at = now() - interval '2 days' where id = $2`,
      [accounts.userId, old?.id],
    );
    expect((await undo(accounts, second.id, old?.id ?? '')).status, 'after 24 h').toBe(403);
    expect((await undo(admin, second.id, old?.id ?? '')).status).toBe(200);
    await expectBalanced(admin);
  });

  it('undoes an old backfilled payment under the old bill-paid entry', async () => {
    const bill = await desk.newBill();
    expect((await record(admin, bill.id)).status).toBe(200);
    const [payment] = await payments(bill.id);
    await rows(`update payable_payments set from_old_bill = true where id = $1`, [payment?.id]);
    await rows(
      `update journal_entries set source_type = 'payable_paid', source_id = $1
        where source_type = 'payable_payment' and source_id = $2`,
      [bill.id, payment?.id],
    );
    expect((await undo(admin, bill.id, payment?.id ?? '')).status).toBe(200);
    expect(await billOf(bill.id)).toMatchObject({ status: 'approved', leftPaise: bill.amount });
    expect(await billPostings(bill.id)).toBe(1);
    expect(await billPaidOut(bill.id)).toBe(0);
    await expectBalanced(admin);
  });

  it('refuses a bank payment, and gives a payment advice once the bank has paid', async () => {
    const bill = await desk.newBill();
    const payout = (await desk.send(admin, bill.id, { amountPaise: 200_000 })).body;
    expect((await admin.raw('GET', `/payouts/${payout.id}/advice.pdf`)).status, 'not paid').toBe(
      409,
    );
    await desk.settle(payout);
    const [bank] = await payments(bill.id);
    expect(bank).toMatchObject({ bank: true, canUndo: false });
    const refused = await undo(admin, bill.id, bank?.id ?? '');
    expect(refused.status).toBe(409);
    expect(refused.text).toContain('Bank transfers come back only through the bank.');
    expect(await billOf(bill.id)).toMatchObject({ paidPaise: 200_000 });

    const pdf = await accounts.download(`/payouts/${payout.id}/advice.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.type).toContain('application/pdf');
    expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect((await desk.options(admin, bill.id)).leftPaise).toBe(bill.amount - 200_000);
    await expectBalanced(admin);
  });
});
