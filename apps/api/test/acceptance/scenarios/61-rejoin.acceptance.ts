import type { MonthlyReview, Person, PointsStanding } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, movePointsToMonth, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { today } from '../support/sales';
import { STAFF } from '../support/team';

// Add back to team (spec Flow 5): a past member comes back active, with no password and
// a fresh invite; their work stays with whoever took it. Leavers drop off the live
// points ranking, while their points rows stay (spec "Points, bonuses and claims").
describe('rejoin', () => {
  let admin: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string) => {
    const made = await ownPerson(admin, name);
    people.push(made);
    return made;
  };
  let leaver: OwnPerson;
  let heir: OwnPerson;
  const month = today().slice(0, 7);

  const remove = () =>
    admin.post<Person>(`/people/${leaver.id}/remove`, {
      handToUserId: heir.id,
      lastWorkingDay: today(),
      tellCustomers: false,
    });
  const rejoin = (who: Session, id: string) =>
    who.raw<{ code: string; message: string }>('POST', `/people/${id}/rejoin`);
  const invites = () =>
    rows(`SELECT 1 FROM outbox WHERE template = 'staff_welcome' AND dedupe_key LIKE $1`, [
      `staff_welcome:${leaver.id}:%`,
    ]);
  const board = async () =>
    (await admin.get<PointsStanding[]>('/points/standings')).map((row) => row.user.id);
  const monthRows = async (m: string) =>
    (await admin.get<MonthlyReview>(`/points/monthly?month=${m}`)).rows.map((row) => row.user.id);

  beforeAll(async () => {
    admin = await Session.admin();
    leaver = await person('Leaver (rejoin test)');
    heir = await person('Heir (rejoin test)');
    await rows(
      `INSERT INTO points_entries (user_id, points, reason, source_type, source_id, status)
       VALUES ($1, 7, 'Recognised (rejoin test)', 'recognition', 'rejoin-test', 'approved')`,
      [leaver.id],
    );
    await rows(`UPDATE users SET password_hash = 'x', last_active_at = now() WHERE id = $1`, [
      leaver.id,
    ]);
  });

  afterAll(async () => {
    await rows(`DELETE FROM points_entries WHERE source_id = 'rejoin-test'`);
    await retire(admin, people);
    await closeDb();
  });

  it('rejoin an active person returns 409', async () => {
    const reply = await rejoin(admin, leaver.id);
    expect([reply.status, reply.body.code]).toEqual([409, 'not_removed']);
    expect(reply.body.message).toBe('This person is still on the team.');
  });

  it('the removed person leaves the live ranking but this month’s review keeps them', async () => {
    expect(await board()).toContain(leaver.id);
    expect(await monthRows(month)).toContain(leaver.id);
    expect((await remove()).status).toBe('inactive');
    expect(await board()).not.toContain(leaver.id);
    // They left this month, so their review for it can still be finished.
    expect(await monthRows(month)).toContain(leaver.id);
    expect(await rows(`SELECT 1 FROM points_entries WHERE user_id = $1`, [leaver.id])).toHaveLength(
      1,
    );
  });

  it('a past month still lists them', async () => {
    await movePointsToMonth(leaver.id, '2026-01');
    expect(await monthRows('2026-01')).toContain(leaver.id);
  });

  it('finance reads a past member settlement but cannot add them back', async () => {
    const finance = await Session.code(STAFF.accounts.phone);
    const read = await finance.raw('GET', `/people/${leaver.id}/departure`);
    expect(read.status).toBe(200);
    expect((await rejoin(finance, leaver.id)).status).toBe(403);
  });

  it('a past member cannot be made to set a new password', async () => {
    const reply = await admin.raw<{ code: string }>('PATCH', `/people/${leaver.id}`, {
      requireNewPassword: true,
    });
    expect([reply.status, reply.body.code]).toEqual([409, 'not_active']);
  });

  it('a skipped newest invite shows no invite, not an older one', async () => {
    await rows(
      `UPDATE outbox SET status = 'sent' WHERE template = 'staff_welcome' AND dedupe_key LIKE $1`,
      [`staff_welcome:${leaver.id}:%`],
    );
    await rows(
      `INSERT INTO outbox (channel, recipient, template, payload, dedupe_key, status, created_at)
       VALUES ('whatsapp', $1, 'staff_welcome', '{}'::jsonb, $2, 'skipped', now() + interval '1 second')`,
      [leaver.phone, `staff_welcome:${leaver.id}:skipped-test`],
    );
    const people = await admin.get<Person[]>('/people');
    expect(people.find((entry) => entry.id === leaver.id)?.inviteDelivery).toBeNull();
  });

  it('rejoin makes them active with no password and queues an invite', async () => {
    const before = (await invites()).length;
    const refused = await rejoin(await Session.code(STAFF.sales.phone), leaver.id);
    expect(refused.status).toBe(403);
    const reply = await admin.post<Person>(`/people/${leaver.id}/rejoin`);
    expect(reply.status).toBe('active');
    const [row] = await rows<{
      status: string;
      left_on: string | null;
      password_hash: string | null;
      last_active_at: Date | null;
    }>('SELECT status, left_on, password_hash, last_active_at FROM users WHERE id = $1', [
      leaver.id,
    ]);
    expect(row).toMatchObject({
      status: 'active',
      left_on: null,
      password_hash: null,
      last_active_at: null,
    });
    expect((await invites()).length).toBe(before + 1);
    expect(
      await rows(`SELECT 1 FROM audit_log WHERE entity_id = $1 AND action = 'person.rejoined'`, [
        leaver.id,
      ]),
    ).toHaveLength(1);
    // Their points count again, and the work stays with the heir.
    expect(await board()).toContain(leaver.id);
  });

  it('rejoin with no mobile number asks for one first', async () => {
    // Not in `people`: removed here already, so the clean-up has nothing to do.
    const phoneless = await ownPerson(admin, 'Phoneless (rejoin test)');
    await admin.post(`/people/${phoneless.id}/remove`, {
      handToUserId: heir.id,
      lastWorkingDay: today(),
      tellCustomers: false,
    });
    await admin.post(`/people/${phoneless.id}/release-phone`);
    const reply = await rejoin(admin, phoneless.id);
    expect([reply.status, reply.body.code, reply.body.message]).toEqual([
      409,
      'phone_needed',
      'Add their mobile number first.',
    ]);
  });
});
