import { describe, expect, it } from 'vitest';
import { paySigningSecret, readPayToken, readPayTokenFor, signPayToken } from './pay-token';

const secret = 'test-secret-long-enough';
const token = { milestoneId: 'm-1', customerId: 'c-1', exp: 2_000_000_000 };

describe('pay tokens', () => {
  it('reads back what was signed', () => {
    expect(readPayToken(secret, signPayToken(secret, token), 1_000)).toEqual(token);
  });

  it('refuses an altered, foreign or expired link', () => {
    const signed = signPayToken(secret, token);
    const [data, mac] = signed.split('.');
    const other = Buffer.from(JSON.stringify(['m-2', 'c-1', token.exp])).toString('base64url');
    expect(readPayToken(secret, `${other}.${mac}`, 1_000)).toBeNull();
    expect(readPayToken('another-secret-entirely', signed, 1_000)).toBeNull();
    expect(readPayToken(secret, signed, token.exp * 1000 + 1)).toBeNull();
    expect(readPayToken(secret, `${data}`, 1_000)).toBeNull();
  });
});

describe('pay-link secrets', () => {
  const token = { milestoneId: 'm1', customerId: 'c1', exp: 2_000 };
  const env = {
    FILE_LINK_SECRET: 'file-secret-0123456789',
    PAY_LINK_SECRET: 'pay-secret-0123456789',
  };

  it('signs with the pay secret, else the file secret', () => {
    expect(paySigningSecret(env)).toBe(env.PAY_LINK_SECRET);
    expect(paySigningSecret({ FILE_LINK_SECRET: env.FILE_LINK_SECRET })).toBe(env.FILE_LINK_SECRET);
  });

  it('still reads links signed with the file secret', () => {
    const oldLink = signPayToken(env.FILE_LINK_SECRET, token);
    const newLink = signPayToken(env.PAY_LINK_SECRET, token);
    expect(readPayTokenFor(env, oldLink, 1_000)).toEqual(token);
    expect(readPayTokenFor(env, newLink, 1_000)).toEqual(token);
    expect(readPayTokenFor(env, signPayToken('someone-elses-secret', token), 1_000)).toBeNull();
  });
});
