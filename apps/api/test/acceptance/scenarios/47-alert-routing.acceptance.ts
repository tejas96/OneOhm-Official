import type { CommandCenter } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { API, Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import {
  addDays,
  createQuotation,
  discomId,
  newCustomer,
  sellProject,
  today,
  uniquePhone,
} from '../support/sales';
import { staffId } from '../support/team';

// Live review B6/B7/B8: an alert for a whole duty skips the Super Admin when someone else
// holds that duty; a project needs a named manager; an online payment tells the project
// manager and the lead owner once each; someone on leave today is covered by their backup.
const TAG = 'alert routing (test)';

/** Everyone except `keep` who approves leave through a role other than the Super Admin's. */
const otherLeaveApprovers = async (keep: string) =>
  (
    await rows<{ id: string }>(
      `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL AND NOT r.system
         JOIN role_capabilities rc ON rc.role_id = r.id AND rc.capability = 'leave.approve'
        WHERE u.status = 'active' AND u.id <> $1`,
      [keep],
    )
  ).map((row) => row.id);

/** Who got alerts of this kind about this subject, or on this project. */
const told = async (kind: string, about: string) =>
  (
    await rows<{ user_id: string }>(
      `SELECT user_id FROM notifications
        WHERE kind = $1 AND (subject_id::text = $2 OR project_id::text = $2)`,
      [kind, about],
    )
  ).map((row) => row.user_id);

/** Approved leave today, with a named backup or none. */
const onLeaveToday = (userId: string, backupUserId: string | null) =>
  rows(
    `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_day, half_days,
       status, reason, backup_user_id)
     VALUES ($1, 'casual', $2, $2, false, 2, 'approved', $3, $4)`,
    [userId, today(), TAG, backupUserId],
  );

describe('Alert routing: by duty, by owner, around leave', () => {
  let admin: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string, roles: string[] = ['hr']) => {
    const made = await ownPerson(admin, name, roles);
    people.push(made);
    return made;
  };

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(async () => {
    await rows('DELETE FROM leave_requests WHERE reason = $1', [TAG]);
    await retire(admin, people);
    await closeDb();
  });

  /** A sold project whose advance the customer pays online in the sandbox. */
  async function paidOnline(name: string, managerUserId: string, leadOwnerId: string) {
    const sale = await sellProject(admin, { name, managerUserId });
    await admin.patch(`/leads/${sale.customer.leadId}`, { ownerUserId: leadOwnerId });
    const [sent] = await rows<{ payload: Record<string, string> }>(
      `SELECT payload FROM outbox WHERE recipient = $1 AND template = 'payment_link'
        ORDER BY created_at DESC LIMIT 1`,
      [sale.customer.phone],
    );
    const opened = await fetch(`${API}/pay/due/${sent?.payload.payToken}?go=1`, {
      redirect: 'manual',
    });
    const sandboxId = (opened.headers.get('location') ?? '').split('/').pop() ?? '';
    const paid = await fetch(`${API}/pay/sandbox/${sandboxId}`, { method: 'POST' });
    expect(paid.status).toBeLessThan(300);
    return sale;
  }

  it('a project cannot be created without a project manager', async () => {
    const customer = await newCustomer(admin, { name: 'No Manager Customer (test)' });
    const quotation = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quotation.id}/send`);
    await admin.post(`/quotations/${quotation.id}/accept`);
    const created = await admin.raw('POST', '/projects', {
      quotationId: quotation.id,
      discomId: await discomId(admin, 'MSEDCL'),
      startDate: today(),
    });
    expect(created.status).toBe(400);
    expect(created.text).toContain('managerUserId');
  });

  it('an online payment tells the project manager and the lead owner once each', async () => {
    const manager = await person('Payment Manager (test)');
    const seller = await person('Payment Seller (test)', ['sales']);
    const sale = await paidOnline('Paid Online Routing (test)', manager.id, seller.id);
    const alerted = await told('payment_online', sale.project.id);
    expect(alerted.filter((id) => id === manager.id)).toHaveLength(1);
    expect(alerted.filter((id) => id === seller.id)).toHaveLength(1);
    expect(new Set(alerted).size).toBe(alerted.length);
    // Accounts hear as a duty; the Super Admin is skipped because accounts hold it too.
    expect(alerted).toContain(await staffId(admin, 'accounts'));
    expect(alerted).not.toContain(admin.userId);
  });

  it('an owner on leave today: their backup gets the alert instead', async () => {
    const manager = await person('Away Manager (test)');
    const backup = await person('Backup Manager (test)');
    const seller = await person('Away Seller Routing (test)', ['sales']);
    await onLeaveToday(manager.id, backup.id);
    const sale = await paidOnline('Paid While Away (test)', manager.id, seller.id);
    const alerted = await told('payment_online', sale.project.id);
    expect(alerted).toContain(backup.id);
    expect(alerted).not.toContain(manager.id);
  });

  it('the command centre counts open leads whose owner is on leave', async () => {
    const owner = await person('Away Lead Owner (test)', ['sales']);
    const cover = await person('Lead Cover (test)', ['sales']);
    await admin.post('/leads', {
      name: 'Lead While Away (test)',
      phone: uniquePhone(),
      city: 'Sangli',
      ownerUserId: owner.id,
      nextActionOn: today(),
    });
    await onLeaveToday(owner.id, cover.id);
    const center = await admin.get<CommandCenter>('/command-center');
    const away = center.actions.find((action) => action.id === 'owner-away-leads');
    expect(away?.title).toMatch(/lead/);
  });

  /** The only HR person at work asks for leave; who hears of the request. */
  async function soleApproverAsks(name: string, backupOfOthers: string | null) {
    const requester = await person(name);
    for (const id of await otherLeaveApprovers(requester.id))
      await onLeaveToday(id, backupOfOthers);
    try {
      const session = await Session.code(requester.phone);
      const asked = await session.post<{ id: string }>('/leave', {
        leaveType: 'casual',
        fromDate: addDays(today(), 1),
        toDate: addDays(today(), 2),
        halfDay: false,
        reason: TAG,
      });
      return { requester, alerted: await told('leave_requested', asked.id) };
    } finally {
      await rows('DELETE FROM leave_requests WHERE reason = $1', [TAG]);
    }
  }

  it('the only other approver asking for leave still reaches the desk', async () => {
    const { requester, alerted } = await soleApproverAsks('Sole Approver (test)', null);
    expect(alerted).toEqual([admin.userId]);
    expect(alerted).not.toContain(requester.id);
  });

  it('a backup who is on leave too does not cover: the desk hears instead', async () => {
    const backup = await person('Away Backup (test)', ['sales']);
    await onLeaveToday(backup.id, null);
    const { alerted } = await soleApproverAsks('Approver With Away Backup (test)', backup.id);
    expect(alerted).toEqual([admin.userId]);
  });
});
