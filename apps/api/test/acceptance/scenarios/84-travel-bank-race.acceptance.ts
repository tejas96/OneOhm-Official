import type { BankPayout, TravelClaim } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { expectBalanced } from '../support/money';
import { ownPerson, retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { STAFF } from '../support/team';
import { claimProjectTravel } from '../support/travel';

// Duty Day Step 0, S9: a bank transfer and a void cannot race. The bill is locked and the
// payout row is saved before the bank is asked. RazorpayX is never called (practice mode).
describe('Travel claim bill: transfer and void', () => {
  let admin: Session;
  let accounts: Session;
  let sale: Sale;

  beforeAll(async () => {
    admin = await Session.admin();
    accounts = await Session.code(STAFF.accounts.phone);
    sale = await sellProject(admin, { name: 'Travel Race Customer (test)' });
  });
  afterAll(closeDb);

  it('S9, S10: an approved claim blocks resume, and a reporting manager cannot void it', async () => {
    const worker = await claimProjectTravel(admin, sale.project, 'Travel Gate Worker (test)');
    const manager = await ownPerson(admin, 'Travel Gate Manager (test)', ['sales']);
    try {
      await rows('INSERT INTO reporting_lines (user_id, manager_user_id) VALUES ($1, $2)', [
        worker.person.id,
        manager.id,
      ]);
      const me = await Session.code(worker.person.phone);
      const resume = await me.raw<{ code?: string }>('POST', '/attendance/resume', {});
      expect(resume.status).toBe(409);
      expect(resume.body.code).toBe('claim_exists');
      const asManager = await Session.code(manager.phone);
      const refused = await asManager.raw('POST', `/travel-claims/${worker.claim.id}/void`, {
        reason: 'Manager tries to void',
      });
      expect(refused.status).toBe(403);
      // The claim tells the web who may void it: finance and HR, not a manager.
      const [seen] = await admin.get<TravelClaim[]>(`/travel-claims?userId=${worker.person.id}`);
      expect(seen).toMatchObject({ status: 'approved', canDecide: false, canVoid: true });
    } finally {
      await retire(admin, [worker.person, manager]);
    }
  });

  it('S9: a failed transfer does not block a void, an open ask to send is closed, and a late send is refused', async () => {
    const racer = await claimProjectTravel(admin, sale.project, 'Travel Race Worker (test)');
    const racerSession = await Session.code(racer.person.phone);
    const payableId = racer.claim.payableId ?? '';
    try {
      await racerSession.put(`/employees/${racer.person.id}/payout-bank`, {
        bankAccountName: 'Travel Race Worker',
        bankIfsc: 'HDFC0000001',
        bankAccountNumber: '555566668888',
        bankAccountNumberConfirm: '555566668888',
      });
      const sent = await admin.post<BankPayout>(`/payables/${payableId}/payouts`);
      // The payout row is saved before the bank is asked, and one is open at a time.
      expect(
        (await rows('select status from bank_payouts where payable_id = $1', [payableId])).length,
      ).toBe(1);
      expect((await admin.raw('POST', `/payables/${payableId}/payouts`)).status).toBe(409);
      await admin.post(`/payouts/${sent.id}/practice`, { outcome: 'failed' });
      // The bill is payable again and Accounts asks for it to be sent.
      const asked = await accounts.post<{ id: string }>(`/payables/${payableId}/payout-request`);
      expect(
        await rows<{ status: string }>('select status from payout_requests where id = $1', [
          asked.id,
        ]),
      ).toEqual([{ status: 'open' }]);
      // Only a transfer that did not fail blocks a void, so this one goes through.
      const voided = await admin.raw<TravelClaim>('POST', `/travel-claims/${racer.claim.id}/void`, {
        reason: 'Race check (test)',
      });
      expect(voided.status).toBe(200);
      expect(
        await rows<{ status: string }>('select status from payout_requests where id = $1', [
          asked.id,
        ]),
      ).toEqual([{ status: 'declined' }]);
      // A cancelled bill cannot be sent any more: the sender checks the bill under its lock.
      const late = await admin.raw<{ code?: string }>('POST', `/payables/${payableId}/payouts`);
      expect(late.status).toBe(409);
      expect(
        (await rows('select 1 from bank_payouts where payable_id = $1', [payableId])).length,
      ).toBe(1);
      await expectBalanced(admin);
    } finally {
      await retire(admin, [racer.person]);
    }
  });
});
