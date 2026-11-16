import type {
  ApprovalItem,
  BankPayout,
  Payable,
  PayoutOptions,
  TravelClaim,
} from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { billLedgerNet } from '../support/bill-ledger';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { expectBalanced, postings } from '../support/money';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { STAFF } from '../support/team';
import { claimProjectTravel, indiaDate, type ProjectTravel } from '../support/travel';

// Duty Day Step 0, S8 to S10: travel claims as bills (bank flow in sandbox only, RazorpayX is
// never called), void with ledger reversal, and who decides a claim.
describe('Travel claims as bills: pay, void and who decides', () => {
  let admin: Session;
  let accounts: Session;
  let sale: Sale;
  let travel: ProjectTravel;
  let me: Session;
  let manager: OwnPerson;
  let peer: OwnPerson;
  let managerSession: Session;
  let peerSession: Session;

  const alerts = (userId: string, kind: string) =>
    rows<{ title: string; body: string; subject_type: string; subject_id: string }>(
      'select title, body, subject_type, subject_id from notifications where user_id = $1 and kind = $2',
      [userId, kind],
    );
  const bill = async (id: string) =>
    (await admin.get<Payable[]>('/finance/payables?status=all')).find((p) => p.id === id);
  const claimsOf = () => me.get<TravelClaim[]>('/me/travel-claims');
  beforeAll(async () => {
    admin = await Session.admin();
    accounts = await Session.code(STAFF.accounts.phone);
    sale = await sellProject(admin, { name: 'Travel Bill Customer (test)' });
    manager = await ownPerson(admin, 'Travel Manager (test)', ['sales']);
    peer = await ownPerson(admin, 'Travel Peer (test)', ['sales']);
    managerSession = await Session.code(manager.phone);
    peerSession = await Session.code(peer.phone);
    // Claim 1 is made and approved by the admin (a Super Admin holds the HR right).
    travel = await claimProjectTravel(admin, sale.project, 'Travel Bill Worker (test)');
    me = await Session.code(travel.person.phone);
  });
  afterAll(async () => {
    await retire(admin, [travel.person, manager, peer]);
    await closeDb();
  });

  it('S8: approving makes a bill to the employee; finance is told and the bill shows the project', async () => {
    const payableId = travel.claim.payableId ?? '';
    expect(payableId).not.toBe('');
    const told = await alerts(accounts.userId, 'travel_payable_ready');
    expect(told.find((row) => row.subject_id === payableId)).toMatchObject({
      subject_type: 'payable',
    });
    // The project is joined from the claim, not copied onto the bill.
    const listed = await bill(payableId);
    expect(listed).toMatchObject({
      party: 'employee',
      status: 'approved',
      projectCode: sale.project.code,
    });
    const own = await rows('select 1 from payables where id = $1 and project_id is null', [
      payableId,
    ]);
    expect(own).toHaveLength(1);
  });

  it('S8: an employee bill has no bank account until one is saved, then goes through the checks', async () => {
    const payableId = travel.claim.payableId ?? '';
    const before = await admin.get<PayoutOptions>(`/payables/${payableId}/payout-options`);
    expect(before.payee).toMatchObject({ kind: 'employee', id: travel.person.id });
    expect(before.problem).toBe('no_bank_details');
    const bad = await me.raw('PUT', `/employees/${travel.person.id}/payout-bank`, {
      bankAccountName: 'Travel Bill Worker',
      bankIfsc: 'nope',
      bankAccountNumber: '555566667777',
      bankAccountNumberConfirm: '555566667777',
    });
    expect(bad.status).toBe(400);
    const refused = await peerSession.raw('PUT', `/employees/${travel.person.id}/payout-bank`, {
      bankAccountName: 'Travel Bill Worker',
      bankIfsc: 'HDFC0000001',
      bankAccountNumber: '555566667777',
      bankAccountNumberConfirm: '555566667777',
    });
    expect(refused.status).toBe(403);
    await me.put(`/employees/${travel.person.id}/payout-bank`, {
      bankAccountName: 'Travel Bill Worker',
      bankIfsc: 'HDFC0000001',
      bankAccountNumber: '555566667777',
      bankAccountNumberConfirm: '555566667777',
    });
    const after = await admin.get<PayoutOptions>(`/payables/${payableId}/payout-options`);
    expect(after.problem).toBeNull();
    expect(after.payee?.accountMasked).toContain('7777');
    expect(after.payee?.accountMasked).not.toContain('5555');
  });

  it('S9: only a decider can void, a reason is needed, and the ledger nets to zero', async () => {
    const payableId = travel.claim.payableId ?? '';
    expect(
      (await me.raw('POST', `/travel-claims/${travel.claim.id}/void`, { reason: 'x ok' })).status,
    ).toBe(409);
    expect(
      (
        await peerSession.raw('POST', `/travel-claims/${travel.claim.id}/void`, {
          reason: 'No right',
        })
      ).status,
    ).toBe(403);
    expect(
      (await admin.raw('POST', `/travel-claims/${travel.claim.id}/void`, { reason: ' ' })).status,
    ).toBe(400);
    expect(await billLedgerNet(payableId)).toEqual([
      { account_code: '2030', net: '-' + travel.claim.amountPaise },
      { account_code: '5050', net: String(travel.claim.amountPaise) },
    ]);
    const voided = await admin.post<TravelClaim>(`/travel-claims/${travel.claim.id}/void`, {
      reason: 'Claimed for the wrong project (test)',
    });
    expect(voided).toMatchObject({
      status: 'cancelled',
      voidReason: 'Claimed for the wrong project (test)',
    });
    expect((await bill(payableId))?.status).toBe('cancelled');
    expect(await postings('payable_approved', payableId)).toBe(1);
    expect((await billLedgerNet(payableId)).map((row) => Number(row.net))).toEqual([0, 0]);
    await expectBalanced(admin);
    expect((await alerts(travel.person.id, 'travel_claim_voided'))[0]?.body).toContain(
      'wrong project',
    );
    expect(
      (await alerts(accounts.userId, 'travel_payable_voided')).some(
        (r) => r.subject_id === payableId,
      ),
    ).toBe(true);
    expect(
      (
        await rows('select 1 from audit_log where action = $1 and entity_id = $2', [
          'travel_claim.voided',
          travel.claim.id,
        ])
      ).length,
    ).toBe(1);
    // A cancelled bill cannot be paid by hand or by bank, and cannot be voided twice.
    const paid = await accounts.raw('POST', `/finance/payables/${payableId}/pay`, {
      method: 'upi',
      paidOn: indiaDate(),
    });
    expect(paid.status).toBe(409);
    const options = await admin.get<PayoutOptions>(`/payables/${payableId}/payout-options`);
    expect(options.problem).toBe('not_approved');
    expect(
      (
        await admin.raw('POST', `/travel-claims/${travel.claim.id}/void`, {
          reason: 'Again please',
        })
      ).status,
    ).toBe(409);
  });

  it('S9: after a void the worker can claim the same day again', async () => {
    await rows('INSERT INTO reporting_lines (user_id, manager_user_id) VALUES ($1, $2)', [
      travel.person.id,
      manager.id,
    ]);
    const claims = await claimsOf();
    expect(claims.find((c) => c.id === travel.claim.id)?.status).toBe('cancelled');
    const again = await me.post<TravelClaim>('/me/travel-claims', {
      workDate: indiaDate(),
      projectId: sale.project.id,
      note: 'Corrected (test)',
    });
    expect(again.status).toBe('pending');
    travel.claim = again;
  });

  it('S10: a new claim goes to the manager first, and only manager, HR or finance decide it', async () => {
    const claim = travel.claim;
    expect((await alerts(manager.id, 'travel_claim')).some((r) => r.subject_id === claim.id)).toBe(
      true,
    );
    // The approvals list: the manager sees it, a peer does not, the worker never.
    const seen = async (who: Session) =>
      (await who.get<ApprovalItem[]>('/approvals/mine')).some(
        (item) => item.kind === 'travel_claim' && item.id === claim.id,
      );
    expect(await seen(managerSession)).toBe(true);
    expect(await seen(peerSession)).toBe(false);
    expect(await seen(me)).toBe(false);
    // The claim says who may decide it, so the web hides the buttons from the rest.
    const view = async (who: Session) =>
      (await who.get<TravelClaim[]>(`/travel-claims?userId=${travel.person.id}`)).find(
        (c) => c.id === claim.id,
      );
    expect((await view(admin))?.canDecide).toBe(true);
    // Self-approval stays forbidden, and a non-decider is refused.
    expect(
      (await me.raw('POST', `/travel-claims/${claim.id}/decide`, { approve: true })).status,
    ).toBe(409);
    expect(
      (await peerSession.raw('POST', `/travel-claims/${claim.id}/decide`, { approve: true }))
        .status,
    ).toBe(403);
    const approved = await managerSession.post<TravelClaim>(`/travel-claims/${claim.id}/decide`, {
      approve: true,
    });
    expect(approved.status).toBe('approved');
    travel.claim = approved;
    expect(await view(admin)).toMatchObject({ canDecide: false, canVoid: true });
  });

  it('S8: sent by bank in practice mode, the bill is paid and the worker is told', async () => {
    const payableId = travel.claim.payableId ?? '';
    const sent = await admin.raw<BankPayout & { message?: string }>(
      'POST',
      `/payables/${payableId}/payouts`,
    );
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ phase: 'on_its_way' });
    const during = await admin.raw('POST', `/travel-claims/${travel.claim.id}/void`, {
      reason: 'Too late?',
    });
    expect(during.status).toBe(409);
    const done = await admin.raw<BankPayout>('POST', `/payouts/${sent.body.id}/practice`, {
      outcome: 'processed',
    });
    expect(done.status).toBe(200);
    expect((await bill(payableId))?.status).toBe('paid');
    const paid = await alerts(travel.person.id, 'travel_claim_paid');
    expect(paid).toHaveLength(1);
    expect(paid[0]?.title).toMatch(/travel for .* paid$/);
    expect(paid[0]).toMatchObject({ subject_type: 'travel_claim', subject_id: travel.claim.id });
    const mine = (await claimsOf()).find((c) => c.id === travel.claim.id);
    expect(mine).toMatchObject({ paid: true });
    expect(
      (await admin.raw('POST', `/travel-claims/${travel.claim.id}/void`, { reason: 'After paid' }))
        .status,
    ).toBe(409);
    await expectBalanced(admin);
  });
});
