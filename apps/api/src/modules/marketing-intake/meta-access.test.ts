import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { metaPostAccess, metaSecrets, metaVerify } from './meta-access';

const raw = Buffer.from('{"object":"page"}');
const signed = (secret: string) =>
  `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

describe('Meta webhook access', () => {
  it('does not exist without an app secret, even for a post that looks signed', () => {
    expect(metaPostAccess(undefined, raw, signed('x'))).toBe('not_found');
  });

  it('refuses a missing or wrong signature', () => {
    expect(metaPostAccess('s3cret', raw, undefined)).toBe('bad_signature');
    expect(metaPostAccess('s3cret', raw, signed('other'))).toBe('bad_signature');
    expect(metaPostAccess('s3cret', undefined, signed('s3cret'))).toBe('bad_signature');
  });

  it('accepts the right signature', () => {
    expect(metaPostAccess('s3cret', raw, signed('s3cret'))).toBe('ok');
  });

  it('prefers the Meta secret and token, else the WhatsApp ones', () => {
    expect(metaSecrets({ META_APP_SECRET: 'm', WHATSAPP_APP_SECRET: 'w' }).appSecret).toBe('m');
    expect(metaSecrets({ WHATSAPP_APP_SECRET: 'w' }).appSecret).toBe('w');
    expect(metaSecrets({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: 't' }).verifyToken).toBe('t');
    expect(metaSecrets({}).appSecret).toBeUndefined();
  });

  it('answers the set-up check only with the right token', () => {
    const ask = { mode: 'subscribe', token: 'tok', challenge: '123' };
    expect(metaVerify('tok', ask)).toEqual({ ok: true, challenge: '123' });
    expect(metaVerify('tok', { ...ask, token: 'bad' })).toEqual({ ok: false, status: 403 });
    expect(metaVerify(undefined, ask)).toEqual({ ok: false, status: 404 });
  });
});
