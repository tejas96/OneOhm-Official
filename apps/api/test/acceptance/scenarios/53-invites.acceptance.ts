import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { setWebPassword } from '../support/password';
import { type OwnPerson, removeNow, retire } from '../support/people';
import { today, uniquePhone } from '../support/sales';
import { roleIds } from '../support/team';

interface Reply {
  id: string;
  phone: string | null;
  invite: string;
  inviteDelivery: string | null;
  inviteText: string | null;
  status: string;
}

// An admin adds a person with a name, a number and roles: no password. The person gets a
// WhatsApp invite (the outbox row is what the worker sends) and sets their own password.
describe('add a person without a password; WhatsApp invite', () => {
  let admin: Session;
  let hr: string[];
  let reseller: string[];
  const made: OwnPerson[] = [];

  const add = (name: string, extra: Record<string, unknown> = {}) => {
    const phone = uniquePhone();
    return admin.raw<Reply & { message: string; code: string }>('POST', '/people', {
      fullName: name,
      phone,
      roleIds: hr,
      ...extra,
    });
  };
  const created = async (name: string, extra: Record<string, unknown> = {}) => {
    const reply = await add(name, extra);
    expect(reply.status).toBe(201);
    made.push({ id: reply.body.id, phone: reply.body.phone ?? '', name });
    return reply.body;
  };
  const invites = (userId: string) =>
    rows<{ recipient: string; payload: { name: string; link: string }; created_at: Date }>(
      `SELECT recipient, payload, created_at FROM outbox
        WHERE template = 'staff_welcome' AND dedupe_key LIKE $1 ORDER BY created_at`,
      [`staff_welcome:${userId}:%`],
    );
  const hashOf = async (userId: string) =>
    (
      await rows<{ password_hash: string | null }>(
        `SELECT password_hash FROM users WHERE id = $1`,
        [userId],
      )
    )[0]?.password_hash;
  const audits = (userId: string, action: string) =>
    rows(`SELECT 1 FROM audit_log WHERE entity_id = $1 AND action = $2`, [userId, action]);

  beforeAll(async () => {
    admin = await Session.admin();
    hr = await roleIds(admin, ['hr']);
    reseller = await roleIds(admin, ['reseller']);
  });
  afterAll(async () => {
    await retire(admin, made);
    await closeDb();
  });

  it('create needs a phone and takes no password', async () => {
    const noPhone = await admin.raw('POST', '/people', {
      fullName: 'No Phone (test)',
      roleIds: hr,
    });
    expect(noPhone.status).toBe(400);

    const person = await created('Password Ignored (test)', { password: 'Typed-by-admin-1' });
    expect(await hashOf(person.id)).toBeNull();
    const signIn = await new Session().raw('POST', '/auth/sign-in', {
      identifier: person.phone,
      password: 'Typed-by-admin-1',
    });
    expect(signIn.status).toBe(401);
  });

  it('create queues one staff_welcome when invites are on', async () => {
    const person = await created('Asha Invited (test)', {
      email: `asha.${Date.now()}@oneohm.local`,
    });
    const queued = await invites(person.id);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.recipient).toBe(person.phone);
    expect(queued[0]?.payload.name).toBe('Asha');
    expect(person.invite).toBe('not_signed_in');
    expect(person.inviteDelivery).toBe('queued');
    expect(person.inviteText).toContain('Hi Asha, you have been added to the OneOhm team.');
    expect(person.inviteText).toContain(queued[0]?.payload.link);

    // Resellers and crews get the field-app link; staff get the website, email or not.
    const partner = await created('Reseller Invited (test)', {
      roleIds: reseller,
      email: `reseller.${Date.now()}@oneohm.local`,
    });
    const [resellerInvite] = await invites(partner.id);
    expect(resellerInvite?.payload.link).not.toBe(queued[0]?.payload.link);
    const crew = await created('Crew Invited (test)', {
      roleIds: await roleIds(admin, ['ic_partner']),
      email: `crew.${Date.now()}@oneohm.local`,
    });
    expect((await invites(crew.id))[0]?.payload.link).toBe(resellerInvite?.payload.link);
    const noEmail = await created('No Email Invited (test)');
    expect((await invites(noEmail.id))[0]?.payload.link).toBe(queued[0]?.payload.link);
  });

  it('resend inside 10 minutes is refused, later it works, after sign-in it is refused', async () => {
    const person = await created('Resend Person (test)');
    const soon = await admin.raw<{ code: string }>('POST', `/people/${person.id}/invite`);
    expect(soon.status).toBe(409);
    expect(soon.body.code).toBe('invite_too_soon');
    expect(await invites(person.id)).toHaveLength(1);

    await acceptanceDb().pool.query(
      `UPDATE outbox SET created_at = now() - interval '11 minutes' WHERE dedupe_key LIKE $1`,
      [`staff_welcome:${person.id}:%`],
    );
    const again = await admin.raw<Reply>('POST', `/people/${person.id}/invite`);
    expect(again.status).toBe(202);
    expect(await invites(person.id)).toHaveLength(2);

    await setWebPassword(person.phone ?? '', 'Own-password-1');
    const late = await admin.raw<{ code: string }>('POST', `/people/${person.id}/invite`);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('already_signed_in');
    const listed = (await admin.get<Reply[]>('/people')).find((entry) => entry.id === person.id);
    expect(listed?.invite).toBe('signed_in');
    expect(listed?.inviteText).toBeNull();
  });

  it('requireNewPassword clears the hash, signs out, re-queues the invite', async () => {
    const person = await created('Reset Person (test)');
    await setWebPassword(person.phone ?? '', 'Old-password-1');
    const web = await Session.password(person.phone ?? '', 'Old-password-1');
    expect(await hashOf(person.id)).not.toBeNull();

    await admin.patch(`/people/${person.id}`, { requireNewPassword: true });
    expect(await hashOf(person.id)).toBeNull();
    expect((await web.raw('GET', '/auth/me')).status).toBe(401);
    expect(await invites(person.id)).toHaveLength(2);
    expect(await audits(person.id, 'person.updated')).not.toHaveLength(0);

    // They read as not signed in again, so the admin can copy the text or send it again.
    const after = (await admin.get<Reply[]>('/people')).find((entry) => entry.id === person.id);
    expect(after?.invite).toBe('not_signed_in');
    expect(after?.inviteText).toContain('Hi Reset');
    await acceptanceDb().pool.query(
      `UPDATE outbox SET created_at = now() - interval '11 minutes' WHERE dedupe_key LIKE $1`,
      [`staff_welcome:${person.id}:%`],
    );
    const resent = await admin.raw('POST', `/people/${person.id}/invite`);
    expect(resent.status).toBe(202);
    expect(await invites(person.id)).toHaveLength(3);
  });

  it("a past member's number gives phone_of_past_member, release-phone frees it, then create works", async () => {
    const past = await created('Past Member (test)');
    const holder = past.phone ?? '';
    const active = await add('Wants Active Number (test)', { phone: holder });
    expect(active.status).toBe(409);
    expect(active.body.code).toBe('duplicate_phone');
    expect(active.body.message).toBe('This mobile number belongs to Past Member (test).');

    expect((await admin.raw('POST', `/people/${past.id}/release-phone`)).status).toBe(409);
    await removeNow(admin, past.id);
    const blocked = await add('Wants Past Number (test)', { phone: holder });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('phone_of_past_member');
    expect((blocked.body as unknown as { details: Record<string, unknown> }).details).toEqual({
      userId: past.id,
      fullName: 'Past Member (test)',
      // Removal stores the leaving day.
      leftOn: today(),
    });

    const released = await admin.raw<Reply>('POST', `/people/${past.id}/release-phone`);
    expect(released.status).toBe(200);
    expect(released.body.phone).toBeNull();
    expect(await audits(past.id, 'person.phone_released')).toHaveLength(1);
    made.splice(
      made.findIndex((entry) => entry.id === past.id),
      1,
    ); // already off, no number
    const joined = await add('Takes The Number (test)', { phone: holder });
    expect(joined.status).toBe(201);
    made.push({ id: joined.body.id, phone: holder, name: 'Takes The Number (test)' });
  });

  it("changing someone's phone deletes their mobile sessions only", async () => {
    const person = await created('Moved Number (test)');
    await setWebPassword(person.phone ?? '', 'Web-password-1');
    const web = await Session.password(person.phone ?? '', 'Web-password-1');
    const phone = await Session.code(person.phone ?? '');
    expect((await phone.raw('GET', '/auth/me')).status).toBe(200);

    await admin.patch(`/people/${person.id}`, { phone: uniquePhone() });
    expect((await phone.raw('GET', '/auth/me')).status).toBe(401);
    expect((await web.raw('GET', '/auth/me')).status).toBe(200);
  });

  it('the invite status survives a phone change', async () => {
    const person = await created('Number Changed Early (test)');
    await acceptanceDb().pool.query(`UPDATE outbox SET status = 'sent' WHERE dedupe_key LIKE $1`, [
      `staff_welcome:${person.id}:%`,
    ]);
    await admin.patch(`/people/${person.id}`, { phone: uniquePhone() });
    const listed = (await admin.get<Reply[]>('/people')).find((entry) => entry.id === person.id);
    expect(listed?.inviteDelivery).toBe('sent');
  });
});
