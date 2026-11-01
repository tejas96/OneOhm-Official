import { describe, expect, it } from 'vitest';
import { readPayToken, signPayToken } from './pay-token';

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
