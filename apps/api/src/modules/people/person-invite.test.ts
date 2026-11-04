import { describe, expect, it } from 'vitest';
import type { Actor } from '../../common/auth/actor';
import { AppError } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { deliveryOf, inviteLink, PersonInvites } from './person-invite';

// The acceptance API always runs with STAFF_INVITES=on (it checks the queued invites), so
// the off path is checked here, against a database that must not be touched at all.
const untouchable = new Proxy({} as Database, {
  get: () => {
    throw new Error('The database was used while invites are off.');
  },
});
const env = (STAFF_INVITES: 'on' | 'off') =>
  ({
    STAFF_INVITES,
    FIELD_APP_URL: 'https://field.test',
    WEB_BASE_URL: 'https://web.test',
  }) as Environment;
const admin = { userId: 'admin' } as Actor;

describe('PersonInvites.resend', () => {
  it('refuses with 409 invites_off while invites are off, and queues nothing', async () => {
    const invites = new PersonInvites(untouchable, env('off'));
    const refused = await invites.resend(admin, 'someone').catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(AppError);
    expect(refused).toMatchObject({
      status: 409,
      code: 'invites_off',
      message: 'WhatsApp invites are off. Copy the invite text instead.',
    });
  });

  it('goes on to the person while invites are on', async () => {
    const invites = new PersonInvites(untouchable, env('on'));
    await expect(invites.resend(admin, 'someone')).rejects.toThrow('database was used');
  });
});

describe('deliveryOf', () => {
  it('reads the newest invite row as final', () => {
    expect(deliveryOf({ status: 'sent', delivery: null })).toBe('sent');
    expect(deliveryOf({ status: 'sent', delivery: 'failed' })).toBe('failed');
    expect(deliveryOf({ status: 'failed', delivery: null })).toBe('failed');
    expect(deliveryOf({ status: 'pending', delivery: null })).toBe('queued');
  });

  it('a skipped newest row is no invite, not an older row state', () => {
    expect(deliveryOf({ status: 'skipped', delivery: null })).toBeNull();
  });
});

describe('inviteLink', () => {
  const links = env('on');
  it('gives the field app only when every role is reseller or partner', () => {
    expect(inviteLink(['reseller'], links)).toBe('https://field.test');
    expect(inviteLink(['partner', 'reseller'], links)).toBe('https://field.test');
  });

  it('gives staff the website, with or without an email', () => {
    expect(inviteLink(['staff'], links)).toBe('https://web.test');
    expect(inviteLink(['staff', 'reseller'], links)).toBe('https://web.test');
    expect(inviteLink([], links)).toBe('https://web.test');
  });
});
