import type { CommissionEntry, Person, QuotationDetail } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { seedWrapUp, WRAPPED_UP, wrapUpState } from '../support/departure';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { addDays, createQuotation, discomId, newCustomer, today } from '../support/sales';
import { STAFF } from '../support/team';

// Remove from team, the guards around it: bad picks, two admins at once, the last Super
// Admin, the old status switch, and a removed reseller's leads (spec "Edge cases").
const TAG = 'removal guards (test)';

describe('removal guards', () => {
  let admin: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string, roles?: readonly string[]) => {
    const made = await ownPerson(admin, name, roles);
    people.push(made);
    return made;
  };
  const remove = (who: Session, id: string, handToUserId: string, lastWorkingDay = today()) =>
    who.raw<{ code: string; message: string }>('POST', `/people/${id}/remove`, {
      handToUserId,
      lastWorkingDay,
      tellCustomers: false,
    });

  beforeAll(async () => {
    admin = await Session.admin();
  });

  afterAll(async () => {
    await rows('DELETE FROM leave_requests WHERE reason = $1', [TAG]);
    await retire(admin, people);
    await closeDb();
  });

  it('remove yourself is refused, and so is a future date', async () => {
    const other = await person('Other (guard test)');
    const self = await remove(admin, admin.userId, other.id);
    expect([self.status, self.body.code]).toEqual([409, 'remove_self']);
    const leaver = await person('Future Leaver (guard test)');
    const future = await remove(admin, leaver.id, other.id, addDays(today(), 1));
    expect([future.status, future.body.code]).toEqual([409, 'future_date']);
    const reseller = await person('Reseller Pick (guard test)', ['reseller']);
    const bad = await remove(admin, leaver.id, reseller.id);
    expect([bad.status, bad.body.code]).toEqual([409, 'target_is_reseller']);
    expect(bad.body.message).toContain('Pick someone else');
  });

  it('two removals racing: exactly one succeeds', async () => {
    const first = await person('Racer A (guard test)');
    const second = await person('Racer B (guard test)');
    const replies = await Promise.all([
      remove(admin, first.id, second.id),
      remove(admin, second.id, first.id),
    ]);
    const statuses = replies.map((reply) => reply.status).sort();
    expect(statuses).toEqual([200, 409]);
    const lost = replies.find((reply) => reply.status === 409);
    expect(lost?.body.code).toBe('target_not_active');
    expect(lost?.body.message).toContain('Pick someone else');
  });

  it('the last Super Admin cannot be removed', async () => {
    const holders = await rows<{ id: string }>(
      `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
       WHERE r.key = 'super_admin' AND u.status = 'active'`,
    );
    // Only meaningful (and only safe) while the seeded admin is the one Super Admin.
    expect(holders.map((row) => row.id)).toEqual([admin.userId]);
    const hr = await Session.code(STAFF.hr.phone);
    const target = await person('Super Admin Cover (guard test)');
    const reply = await remove(hr, admin.userId, target.id);
    expect([reply.status, reply.body.code]).toEqual([409, 'last_super_admin']);
    const [still] = await rows<{ status: string }>('SELECT status FROM users WHERE id = $1', [
      admin.userId,
    ]);
    expect(still?.status).toBe('active');
  });

  it('PATCH status inactive still works, wraps up and stores left_on', async () => {
    const leaver = await person('Switched Off (guard test)');
    await seedWrapUp(leaver, TAG);
    const off = await admin.patch<Person>(`/people/${leaver.id}`, { status: 'inactive' });
    expect(await wrapUpState(leaver, TAG)).toEqual(WRAPPED_UP);
    expect(off.leftOn).toBe(today());
    // Switching back on is Add back to team, which clears the password and re-invites.
    const back = await admin.raw<{ code: string; message: string }>(
      'PATCH',
      `/people/${leaver.id}`,
      { status: 'active' },
    );
    expect([back.status, back.body.code, back.body.message]).toEqual([
      409,
      'use_rejoin',
      'Use Add back to team.',
    ]);
  });

  it('a lead brought in by a removed reseller still makes a pending commission when it wins', async () => {
    const partner = await person('Leaving Reseller (guard test)', ['reseller']);
    const cover = await person('Reseller Cover (guard test)');
    await admin.put(`/commission-rules/resellers/${partner.id}`, {
      basis: 'percent',
      rateBp: 100,
      perKwPaise: 0,
      qualifyingEvent: 'project_created',
      active: true,
    });
    const seller = await Session.code(partner.phone);
    const sell = async (name: string) => {
      const lead = await newCustomer(seller, { name });
      return createQuotation(seller, lead, { targetWp: 2000 });
    };
    // A lead the reseller owns but that never named them as its reseller.
    const ownedLead = await newCustomer(seller, { name: 'Owned Only (removed reseller test)' });
    const owned = await createQuotation(seller, ownedLead, { targetWp: 2000 });
    await rows('UPDATE leads SET reseller_user_id = NULL, owner_user_id = $2 WHERE id = $1', [
      ownedLead.leadId,
      partner.id,
    ]);
    const win = async (quote: QuotationDetail) => {
      await admin.post(`/quotations/${quote.id}/send`);
      await admin.post(`/quotations/${quote.id}/accept`);
      return admin.post<{ id: string }>('/projects', {
        quotationId: quote.id,
        discomId: await discomId(admin, 'MSEDCL'),
        managerUserId: admin.userId,
        startDate: today(),
      });
    };
    const entries = () => admin.get<CommissionEntry[]>(`/commissions?resellerId=${partner.id}`);
    const before = await sell('Won Before (removed reseller test)');
    const later = await sell('Wins Later (removed reseller test)');
    const earlier = await win(before);
    const approved = (await entries()).find((entry) => entry.projectId === earlier.id);
    await admin.post(`/commissions/${approved?.id}/approve`);

    expect((await remove(admin, partner.id, cover.id)).status).toBe(200);
    // Their rule stays on, so the lead they brought in still earns.
    const [rule] = await rows<{ active: boolean }>(
      'SELECT active FROM commission_rules WHERE reseller_user_id = $1',
      [partner.id],
    );
    expect(rule?.active).toBe(true);

    const project = await win(later);
    // The owned lead went to the cover with the reseller's credit, so its win still earns.
    const [moved] = await rows<{ owner_user_id: string; reseller_user_id: string }>(
      'SELECT owner_user_id, reseller_user_id FROM leads WHERE id = $1',
      [ownedLead.leadId],
    );
    expect(moved).toEqual({ owner_user_id: cover.id, reseller_user_id: partner.id });
    const ownedProject = await win(owned);
    const after = await entries();
    expect(after.find((entry) => entry.projectId === earlier.id)?.status).toBe('approved');
    expect(after.find((entry) => entry.projectId === project.id)?.status).toBe('pending');
    expect(after.find((entry) => entry.projectId === ownedProject.id)?.status).toBe('pending');
  });
});
