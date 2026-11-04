import type { CommissionEntry, QuotationDetail } from '@oneohm/api-contracts';
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

  it('PATCH status inactive still works and wraps up', async () => {
    const leaver = await person('Switched Off (guard test)');
    await seedWrapUp(leaver, TAG);
    await admin.patch(`/people/${leaver.id}`, { status: 'inactive' });
    expect(await wrapUpState(leaver, TAG)).toEqual(WRAPPED_UP);
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
    const [rule] = await rows<{ active: boolean }>(
      'SELECT active FROM commission_rules WHERE reseller_user_id = $1',
      [partner.id],
    );
    expect(rule?.active).toBe(false);

    const project = await win(later);
    const after = await entries();
    expect(after.find((entry) => entry.projectId === earlier.id)?.status).toBe('approved');
    expect(after.find((entry) => entry.projectId === project.id)?.status).toBe('pending');
  });
});
