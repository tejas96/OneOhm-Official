import type { CommissionEntry, PayoutDetailsView } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, removeNow, retire } from '../support/people';
import { createQuotation, discomId, newCustomer, today } from '../support/sales';
import { STAFF } from '../support/team';

const FULL = {
  bankAccountName: 'Meera Solar Works',
  bankAccountNumber: '123456789012',
  bankIfsc: 'sbin0001234',
  upiId: null,
  pan: ' abcde1234f ',
};
const NO_BANK = { ...FULL, bankAccountName: null, bankAccountNumber: null, bankIfsc: null };

// Finance cannot pay a reseller until PAN plus UPI or bank details are saved. Account
// numbers and PAN are masked for everyone except finance.
describe('reseller payout details', () => {
  let admin: Session;
  let finance: Session;
  let reseller: Session;
  let other: Session;
  let mine: OwnPerson;
  let away: OwnPerson;
  let entryId = '';
  const path = (id: string) => `/resellers/${id}/payout-details`;

  beforeAll(async () => {
    admin = await Session.admin();
    finance = await Session.code(STAFF.accounts.phone);
    other = await Session.code(STAFF.sales.phone);
    mine = await ownPerson(admin, 'Payout Reseller (test)', ['reseller']);
    away = await ownPerson(admin, 'Gone Reseller (test)', ['reseller']);
    reseller = await Session.code(mine.phone);
    await admin.put(`/commission-rules/resellers/${mine.id}`, {
      basis: 'percent',
      rateBp: 200,
      perKwPaise: 0,
      qualifyingEvent: 'project_created',
      active: true,
    });
    const lead = await newCustomer(reseller, { name: 'Payout Lead (test)' });
    const quote = await createQuotation(reseller, lead, { targetWp: 3000 });
    await reseller.post(`/quotations/${quote.id}/send`);
    await reseller.post(`/quotations/${quote.id}/accept`);
    await admin.post('/projects', {
      quotationId: quote.id,
      discomId: await discomId(admin, 'MSEDCL'),
      managerUserId: admin.userId,
      startDate: today(),
    });
    const entries = await admin.get<CommissionEntry[]>(`/commissions?resellerId=${mine.id}`);
    entryId = entries[0]?.id ?? '';
    await admin.post(`/commissions/${entryId}/approve`);
  });
  afterAll(async () => {
    await retire(admin, [mine, away]);
    await closeDb();
  });

  const pay = () =>
    finance.raw<{ code: string; message: string }>('POST', `/commissions/${entryId}/pay`, {
      method: 'bank_transfer',
      paidOn: today(),
      reference: 'NEFT-PAYOUT-TEST',
    });

  it('reseller saves own details and sees them masked', async () => {
    const empty = await reseller.get<PayoutDetailsView>(path(mine.id));
    expect(empty.complete).toBe(false);
    const saved = await reseller.put<PayoutDetailsView>(path(mine.id), FULL);
    expect(saved).toMatchObject({
      bankAccountNumber: '••••9012',
      pan: '••••234F',
      bankIfsc: 'SBIN0001234',
      complete: true,
    });
    const again = await reseller.get<PayoutDetailsView>(path(mine.id));
    expect(again.pan).toBe('••••234F');
    // Sending the masked values back keeps what was stored.
    await reseller.put(path(mine.id), { ...FULL, bankAccountNumber: '••••9012', pan: '••••234F' });
    const stored = await finance.get<PayoutDetailsView>(path(mine.id));
    expect(stored.pan).toBe('ABCDE1234F');
    expect(stored.bankAccountNumber).toBe('123456789012');
  });

  it('rejects badly formed values with field errors', async () => {
    const bad = await reseller.raw<{ fieldErrors: Record<string, string> }>('PUT', path(mine.id), {
      ...FULL,
      pan: 'nope',
    });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fieldErrors)).toEqual(['pan']);
  });

  it('finance sees them unmasked', async () => {
    const view = await finance.get<PayoutDetailsView>(path(mine.id));
    expect(view).toMatchObject({ pan: 'ABCDE1234F', bankAccountNumber: '123456789012' });
  });

  it('another staff member gets 403', async () => {
    expect((await other.raw('GET', path(mine.id))).status).toBe(403);
    expect((await other.raw('PUT', path(mine.id), FULL)).status).toBe(403);
    expect((await reseller.raw('GET', path(away.id))).status).toBe(403);
  });

  it('writes an audit entry with field names and no values', async () => {
    const [audit] = await rows<{ data: { fields: string[] } }>(
      `SELECT data FROM audit_log WHERE entity_id = $1 AND action = 'reseller.payout_details_saved'
        ORDER BY created_at LIMIT 1`,
      [mine.id],
    );
    expect(audit?.data.fields).toContain('pan');
    expect(JSON.stringify(audit?.data)).not.toContain('ABCDE1234F');
  });

  it('finance is told when the reseller changes details', async () => {
    const [note] = await rows<{ title: string }>(
      `SELECT title FROM notifications WHERE user_id = $1 AND kind = 'payout_details_changed'
        AND title LIKE $2`,
      [finance.userId, `${mine.name}%`],
    );
    expect(note?.title).toBe(`${mine.name} changed their payout details`);
    // The Super Admin holds the duty through a system role and hears too.
    const [boss] = await rows(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'payout_details_changed'
        AND title LIKE $2`,
      [admin.userId, `${mine.name}%`],
    );
    expect(boss).toBeDefined();
    const before = await rows(`SELECT 1 FROM notifications WHERE kind = 'payout_details_changed'`);
    await finance.put(path(mine.id), { ...FULL, upiId: 'meera@okaxis' });
    const after = await rows(`SELECT 1 FROM notifications WHERE kind = 'payout_details_changed'`);
    expect(after.length).toBe(before.length);
  });

  it('half bank details + PAN still blocks pay', async () => {
    const half = await finance.put<PayoutDetailsView>(path(mine.id), {
      ...NO_BANK,
      bankAccountNumber: '123456789012',
    });
    expect(half.complete).toBe(false);
    const blocked = await pay();
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('payout_details_missing');
  });

  it('pay is blocked until complete, then works', async () => {
    await admin.put(path(mine.id), {
      ...FULL,
      pan: null,
    });
    const blocked = await pay();
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('payout_details_missing');
    expect(blocked.body.message).toBe(
      `Add ${mine.name}'s payout details before marking this paid.`,
    );
    const listed = await finance.get<CommissionEntry[]>(`/commissions?resellerId=${mine.id}`);
    expect(listed.find((row) => row.id === entryId)?.payoutReady).toBe(false);
    await finance.put(path(mine.id), FULL);
    expect((await pay()).status).toBe(200);
  });

  it('finance can fill details for an inactive reseller', async () => {
    await removeNow(admin, away.id);
    const saved = await finance.put<PayoutDetailsView>(path(away.id), NO_BANK);
    expect(saved).toMatchObject({ pan: 'ABCDE1234F', complete: false });
    const upi = await finance.put<PayoutDetailsView>(path(away.id), {
      ...NO_BANK,
      upiId: 'Gone@okaxis',
    });
    expect(upi).toMatchObject({ upiId: 'Gone@okaxis', complete: true });
  });
});
