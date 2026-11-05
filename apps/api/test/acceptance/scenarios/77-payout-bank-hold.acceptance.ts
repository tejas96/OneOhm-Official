import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { PayoutDesk } from '../support/payout-desk';
import { uniquePhone } from '../support/sales';

// New bank details wait 24 hours before money goes to them; a different approver can
// release the hold early; a first entry of details has no hold.
describe('Payout people: bank change hold', () => {
  const desk = new PayoutDesk('Payout Hold Customer (test)', 810000);
  const { options, send, alerts, audits, settle } = desk;
  let admin: Session;
  let accounts: Session;
  let second: Session;

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
    return bill.id;
  }

  it('holds transfers for 24 hours after bank details change; another approver releases', async () => {
    // The sale's own crew, so the shared standing crews are never put on hold.
    const crewName = `Hold Crew ${uniquePhone()} (test)`;
    const crew = await admin.post<{ id: string }>('/contractors', {
      name: crewName,
      kind: 'company',
      phone: uniquePhone(),
      skills: ['ic_partner'],
      tdsBp: 100,
      retentionBp: 0,
      retentionDays: 90,
      paymentTermsDays: 15,
      bankAccountName: crewName,
      bankAccountNumber: '444455556666',
      bankAccountNumberConfirm: '444455556666',
      bankIfsc: 'HDFC0000001',
    });
    await rows('update work_orders set contractor_id = $1 where id = $2', [crew.id, desk.orderId]);
    const bill = await newBill();
    const payee = (await options(admin, bill)).payee;
    expect(payee).toMatchObject({ kind: 'contractor', id: crew.id });
    const id = crew.id;
    const [old] = await rows<{ name: string; num: string; ifsc: string }>(
      'select bank_account_name as name, bank_account_number as num, bank_ifsc as ifsc from contractors where id = $1',
      [id],
    );
    const accountsBefore = Number(
      (
        await rows<{ n: string }>('select count(*) as n from payout_accounts where payee_id = $1', [
          id,
        ])
      )[0]?.n,
    );
    await admin.patch(`/contractors/${id}`, {
      bankAccountNumber: '999888777666',
      bankAccountNumberConfirm: '999888777666',
    });
    const [held] = await rows<{ until: Date; by: string; at: Date }>(
      'select bank_hold_until as until, bank_changed_by_user_id as by, bank_changed_at as at from contractors where id = $1',
      [id],
    );
    expect(held?.by).toBe(admin.userId);
    const hours = ((held?.until.getTime() ?? 0) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    const [audit] = await audits('payee.bank_changed', id);
    const text = JSON.stringify(audit?.data);
    expect(text).toContain('7666');
    expect(text).toContain('6666');
    expect(text).not.toContain('999888777666');
    expect(text).not.toContain(old?.num ?? 'x');
    const [alert] = await alerts(second.userId, 'payee_bank_changed');
    expect(alert?.body).toContain(`${admin.name} changed the bank details of`);
    expect(await alerts(admin.userId, 'payee_bank_changed')).toHaveLength(0);

    expect(await options(admin, bill)).toMatchObject({
      problem: 'bank_on_hold',
      canSend: false,
      hold: { canRelease: false },
    });
    expect((await options(second, bill)).hold?.canRelease).toBe(true);
    const stopped = await send(admin, bill);
    expect(stopped.status).toBe(409);
    expect(stopped.body.code).toBe('bank_on_hold');
    expect(await rows('select 1 from bank_payouts where payable_id = $1', [bill])).toHaveLength(0);
    expect(
      Number(
        (
          await rows<{ n: string }>(
            'select count(*) as n from payout_accounts where payee_id = $1',
            [id],
          )
        )[0]?.n,
      ),
      'no new fund account while held',
    ).toBe(accountsBefore);
    // Saving the same details again (only letter case differs) is not a change.
    await admin.patch(`/contractors/${id}`, {
      bankAccountNumber: '999888777666',
      bankAccountNumberConfirm: '999888777666',
      bankAccountName: crewName.toUpperCase(),
    });
    expect(await audits('payee.bank_changed', id)).toHaveLength(1);

    const release = `/payees/contractor/${id}/bank-hold/release`;
    expect((await admin.raw('POST', release)).status, 'the changer cannot release').toBe(403);
    expect((await accounts.raw('POST', release)).status, 'needs approve rights').toBe(403);
    expect((await second.raw('POST', release)).status).toBe(204);
    expect(await audits('payee.bank_hold_released', id)).toHaveLength(1);
    expect((await alerts(admin.userId, 'payee_bank_hold_released')).length).toBeGreaterThan(0);
    const sent = await send(admin, bill);
    expect(sent.status).toBe(201);
    await settle(sent.body);
    expect(
      Number(
        (
          await rows<{ n: string }>(
            'select count(*) as n from payout_accounts where payee_id = $1',
            [id],
          )
        )[0]?.n,
      ),
      'a new fund account after the hold',
    ).toBe(accountsBefore + 1);

    // Put the old details back (a change again), then release so later scenarios are free.
    await admin.patch(`/contractors/${id}`, {
      bankAccountNumber: old?.num,
      bankAccountNumberConfirm: old?.num,
    });
    expect((await second.raw('POST', release)).status).toBe(204);
  });

  it('a first entry of bank details has no hold', async () => {
    const name = `First Bank Crew ${uniquePhone()} (test)`;
    const crew = await admin.post<{ id: string }>('/contractors', {
      name,
      kind: 'company',
      phone: uniquePhone(),
      skills: ['ic_partner'],
      tdsBp: 100,
      retentionBp: 0,
      retentionDays: 90,
      paymentTermsDays: 15,
    });
    await admin.patch(`/contractors/${crew.id}`, {
      bankAccountName: name,
      bankAccountNumber: '555566667777',
      bankAccountNumberConfirm: '555566667777',
      bankIfsc: 'HDFC0000001',
    });
    const [row] = await rows<{ until: Date | null; at: Date | null }>(
      'select bank_hold_until as until, bank_changed_at as at from contractors where id = $1',
      [crew.id],
    );
    expect(row?.until).toBeNull();
    expect(row?.at).not.toBeNull();
    expect(await audits('payee.bank_added', crew.id)).toHaveLength(1);
    expect(await audits('payee.bank_changed', crew.id)).toHaveLength(0);
    // The next real change is held.
    await admin.patch(`/contractors/${crew.id}`, { bankIfsc: 'ICIC0000002' });
    const [after] = await rows<{ until: Date | null }>(
      'select bank_hold_until as until from contractors where id = $1',
      [crew.id],
    );
    expect(after?.until).not.toBeNull();
  });
});
