import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { PayoutDesk } from '../support/payout-desk';
import { STAFF } from '../support/team';

// Who may send money to a bank: a person who only records payments asks and an approver
// sends from Approvals; above a limit two people must take part.
describe('Payout people: ask to send and two people above a limit', () => {
  const desk = new PayoutDesk('Payout People Customer (test)', 710000);
  const { options, send, inbox, alerts, audits, settle } = desk;
  let admin: Session;
  let accounts: Session;
  let second: Session;
  let amount = 0;

  beforeAll(async () => {
    await desk.open();
    ({ admin, accounts, second } = desk);
  });
  afterAll(async () => {
    await desk.close();
    await closeDb();
  });

  /** A fresh approved bill; remembers its amount. */
  async function newBill(): Promise<string> {
    const bill = await desk.newBill();
    amount = bill.amount;
    return bill.id;
  }

  it('asks to send; the approver sends from Approvals; the asker cannot', async () => {
    const bill = await newBill();
    const before = await options(accounts, bill);
    expect(before).toMatchObject({ canAsk: true, canSend: false, request: null });
    expect((await send(accounts, bill)).status, 'asker cannot send').toBe(403);
    expect(
      (
        await accounts.raw('POST', `/payables/${bill}/payout-request`, {
          amountPaise: amount + 100,
        })
      ).status,
    ).toBe(400);
    const asked = await accounts.post<{ amountPaise: number; mine: boolean }>(
      `/payables/${bill}/payout-request`,
    );
    expect(asked).toMatchObject({ amountPaise: amount, mine: true });
    expect(
      (await accounts.raw('POST', `/payables/${bill}/payout-request`)).status,
      'one open ask',
    ).toBe(409);
    expect(
      (await admin.raw('POST', `/payables/${bill}/payout-request`)).status,
      'approver sends',
    ).toBe(409);
    expect(await options(accounts, bill)).toMatchObject({ canAsk: false, request: { mine: true } });
    expect(await options(admin, bill)).toMatchObject({
      canSend: true,
      request: { mine: false, requestedByName: STAFF.accounts.name },
    });
    expect(await inbox(accounts, bill), 'not in the asker’s own inbox').toBeUndefined();
    const item = await inbox(admin, bill);
    expect(item).toMatchObject({ amountPaise: amount, requesterName: STAFF.accounts.name });
    // The subject is the payee alone; screens add "Send ₹X to" in their language.
    expect(item?.subject).toMatch(/^(?!Send ).+/);
    const [alert] = await alerts(admin.userId, 'payout_requested');
    expect(alert?.title).toContain(`${STAFF.accounts.name} asks to send`);
    expect(await alerts(accounts.userId, 'payout_requested')).toHaveLength(0);
    expect(await audits('payout.requested', bill)).toHaveLength(1);

    // Taking it back, then asking again; an approver declining with a note tells the asker.
    expect((await accounts.raw('DELETE', `/payables/${bill}/payout-request`)).status).toBe(204);
    expect((await options(admin, bill)).request).toBeNull();
    await accounts.post(`/payables/${bill}/payout-request`);
    expect(
      (await accounts.raw('POST', `/payables/${bill}/payout-request/decline`, { note: 'No' }))
        .status,
    ).toBe(403);
    await admin.post(`/payables/${bill}/payout-request/decline`, { note: 'Wait for the invoice' });
    const [declined] = await alerts(accounts.userId, 'payout_request_declined');
    expect(declined?.body).toBe('Wait for the invoice');
    expect(await audits('payout.request_declined', bill)).toHaveLength(1);
    await accounts.post(`/payables/${bill}/payout-request`, { amountPaise: 200_000 });

    // The approver says yes in the inbox: the same send path, for the asked amount.
    const sent = await send(admin, bill, { amountPaise: item?.amountPaise });
    expect(sent.status).toBe(201);
    expect((await options(admin, bill)).request, 'sending clears the ask').toBeNull();
    const [payout] = await rows<{ asked: string | null; req: string | null }>(
      'select asked_by_user_id as asked, payout_request_id as req from bank_payouts where id = $1',
      [sent.body.id],
    );
    expect(payout?.asked).toBe(accounts.userId);
    expect(payout?.req).not.toBeNull();
    expect((await audits('payout.sent', bill))[0]?.data).toMatchObject({
      askedByUserId: accounts.userId,
    });
    await settle(sent.body);
  });

  it('needs two people above the limit, and not below it', async () => {
    await desk.limit(100_000);
    const lone = await newBill();
    const hint = await options(admin, lone);
    expect(hint).toMatchObject({ canSend: false, secondPerson: { needed: true, met: false } });
    expect(hint.secondPerson.text).toContain('Above ₹1,000, two people must take part.');
    expect(hint.secondPerson.text).toContain(STAFF.accounts.name);
    const blocked = await send(admin, lone);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('second_person_needed');
    // A different approver is the second person: they did not approve the bill.
    expect((await options(second, lone)).secondPerson.met).toBe(true);
    // The asker is the second person too.
    await accounts.post(`/payables/${lone}/payout-request`);
    expect((await options(admin, lone)).secondPerson.met).toBe(true);
    const passed = await send(admin, lone);
    expect(passed.status).toBe(201);
    await settle(passed.body);
    // Another bill: the other approver sends alone.
    const other = await newBill();
    const fromSecond = await send(second, other);
    expect(fromSecond.status).toBe(201);
    await settle(fromSecond.body);
    // A part within the limit needs no second person.
    const small = await newBill();
    expect((await send(admin, small, { amountPaise: 100_000 })).status).toBe(201);
    expect((await send(admin, small, { amountPaise: 100_100 })).status, 'already sending').toBe(
      409,
    );
    await desk.limit(0);
  });
});
