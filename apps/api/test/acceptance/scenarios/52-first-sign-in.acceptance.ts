import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { OTP_CODE, Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { uniquePhone } from '../support/sales';

// A person with no web password (or who forgot it) proves their phone with a text code,
// then chooses a password and is signed in.
describe('first sign-in and forgotten password', () => {
  let admin: Session;
  const made: OwnPerson[] = [];

  async function newPerson(name: string): Promise<OwnPerson> {
    const person = await ownPerson(admin, name);
    made.push(person);
    return person;
  }

  const challenges = (phone: string) =>
    rows<{ attempts: number }>(
      `SELECT attempts FROM otp_challenges WHERE phone_e164 = $1 AND purpose = 'password_reset'`,
      [phone],
    );
  const audits = (userId: string, action: string) =>
    rows(`SELECT 1 FROM audit_log WHERE entity_id = $1 AND action = $2`, [userId, action]);

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(async () => {
    await retire(admin, made);
    await closeDb();
  });

  it('a new person with no password sets one and is signed in', async () => {
    const person = await newPerson('First Sign-in Person (test)');
    const code = `FS${person.id.slice(0, 8)}`.toUpperCase();
    await admin.patch(`/people/${person.id}`, { employeeCode: code });

    const guest = new Session();
    const asked = await guest.raw('POST', '/auth/password/code', { phone: person.phone });
    expect(asked.status).toBe(202);

    const set = await guest.raw<{ user: { id: string } }>('POST', '/auth/password', {
      phone: person.phone,
      code: OTP_CODE,
      password: 'Brand-new-pass-1',
    });
    expect(set.status).toBe(200);
    expect(set.body.user.id).toBe(person.id);
    expect((await guest.raw('GET', '/auth/me')).status).toBe(200);

    const later = await new Session().raw('POST', '/auth/sign-in', {
      identifier: code,
      password: 'Brand-new-pass-1',
    });
    expect(later.status).toBe(200);
  });

  it('the first set writes auth.password_set, a later one writes auth.password_reset', async () => {
    const person = await newPerson('Forgetful Person (test)');
    const set = async (password: string) => {
      const guest = new Session();
      await guest.post('/auth/password/code', { phone: person.phone });
      await guest.post('/auth/password', { phone: person.phone, code: OTP_CODE, password });
    };
    await set('First-password-1');
    expect(await audits(person.id, 'auth.password_set')).toHaveLength(1);
    expect(await audits(person.id, 'auth.password_reset')).toHaveLength(0);
    await set('Second-password-2');
    expect(await audits(person.id, 'auth.password_set')).toHaveLength(1);
    expect(await audits(person.id, 'auth.password_reset')).toHaveLength(1);
  });

  it('setting a password signs out every other session', async () => {
    const person = await newPerson('Other Sessions Person (test)');
    const earlier = await Session.code(person.phone);
    expect((await earlier.raw('GET', '/auth/me')).status).toBe(200);

    const guest = new Session();
    await guest.post('/auth/password/code', { phone: person.phone });
    await guest.post('/auth/password', {
      phone: person.phone,
      code: OTP_CODE,
      password: 'Fresh-password-3',
    });
    expect((await earlier.raw('GET', '/auth/me')).status).toBe(401);
    expect((await guest.raw('GET', '/auth/me')).status).toBe(200);
  });

  it('unknown and inactive numbers get 202 and no challenge', async () => {
    const unknown = uniquePhone();
    const gone = await newPerson('Switched Off Person (test)');
    await admin.patch(`/people/${gone.id}`, { status: 'inactive' });
    for (const phone of [unknown, gone.phone]) {
      const reply = await new Session().raw('POST', '/auth/password/code', { phone });
      expect(reply.status).toBe(202);
      expect(await challenges(phone)).toHaveLength(0);
    }
  });

  it('a wrong code counts toward lockout and the code dies after 5 tries', async () => {
    const person = await newPerson('Wrong Code Person (test)');
    const guest = new Session();
    await guest.post('/auth/password/code', { phone: person.phone });
    for (let tries = 0; tries < 5; tries += 1) {
      const wrong = await guest.raw('POST', '/auth/password', {
        phone: person.phone,
        code: '000000',
        password: 'Never-set-pass-4',
      });
      expect(wrong.status).toBe(401);
    }
    expect((await challenges(person.phone))[0]?.attempts).toBe(5);
    const right = await guest.raw<{ code: string }>('POST', '/auth/password', {
      phone: person.phone,
      code: OTP_CODE,
      password: 'Never-set-pass-4',
    });
    expect(right.status).toBe(401);
    expect(right.body.code).toBe('bad_code');
    const failed = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM sign_in_attempts WHERE identifier = $1 AND success = false`,
      [person.phone],
    );
    expect(failed[0]?.n).toBeGreaterThanOrEqual(5);
  });

  it('using one code cancels the other codes and the same code cannot be used twice', async () => {
    const person = await newPerson('Two Codes Person (test)');
    const guest = new Session();
    await guest.post('/auth/password/code', { phone: person.phone });
    await guest.post('/auth/password/code', { phone: person.phone });
    const body = { phone: person.phone, code: OTP_CODE, password: 'Once-only-pass-5' };
    expect((await guest.raw('POST', '/auth/password', body)).status).toBe(200);
    const again = await new Session().raw<{ code: string }>('POST', '/auth/password', body);
    expect(again.status).toBe(401);
    expect(again.body.code).toBe('bad_code');
    const open = await rows(
      `SELECT 1 FROM otp_challenges WHERE phone_e164 = $1 AND purpose = 'password_reset' AND consumed_at IS NULL`,
      [person.phone],
    );
    expect(open).toHaveLength(0);
  });

  it('two parallel requests with the right code: exactly one wins', async () => {
    const person = await newPerson('Parallel Person (test)');
    await new Session().post('/auth/password/code', { phone: person.phone });
    const body = { phone: person.phone, code: OTP_CODE, password: 'Parallel-pass-6' };
    const replies = await Promise.all([
      new Session().raw('POST', '/auth/password', body),
      new Session().raw('POST', '/auth/password', body),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 401]);
    expect(await audits(person.id, 'auth.password_set')).toHaveLength(1);
  });

  it('password budget is separate from login budget', async () => {
    const person = await newPerson('Separate Budget Person (test)');
    // Use up the login budget (1000 per 10 minutes in the acceptance API).
    await rows(
      `INSERT INTO otp_challenges (phone_e164, code_hash, expires_at, purpose)
       SELECT $1, 'x', now() + interval '5 minutes', 'staff' FROM generate_series(1, 1000)`,
      [person.phone],
    );
    const login = await new Session().raw('POST', '/auth/otp', { phone: person.phone });
    expect(login.status).toBe(429);
    const reset = await new Session().raw('POST', '/auth/password/code', { phone: person.phone });
    expect(reset.status).toBe(202);
    expect(await challenges(person.phone)).toHaveLength(1);
  });
});
