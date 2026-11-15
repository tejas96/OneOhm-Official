import { describe, expect, it } from 'vitest';
import { STATE_LIFETIME_MS, signState, verifyState } from './connection-state';

const SECRET = 'a-test-secret-for-signing-states';
const NOW = 1_800_000_000_000;

describe('connect state', () => {
  it('accepts a state we signed', () => {
    const state = signState(SECRET, { provider: 'meta', userId: 'u1' }, NOW);
    expect(verifyState(SECRET, state, NOW + 1000)).toMatchObject({
      provider: 'meta',
      userId: 'u1',
    });
  });

  it('refuses a changed body', () => {
    const state = signState(SECRET, { provider: 'meta', userId: 'u1' }, NOW);
    const [, signature] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({ provider: 'meta', userId: 'u2', exp: NOW + 1e9, nonce: 'x' }),
    ).toString('base64url');
    expect(verifyState(SECRET, `${forged}.${signature}`, NOW)).toBeNull();
  });

  it('refuses another key, junk and missing values', () => {
    const state = signState(SECRET, { provider: 'google', userId: 'u1' }, NOW);
    expect(verifyState('another-secret-entirely-different', state, NOW)).toBeNull();
    expect(verifyState(SECRET, 'junk', NOW)).toBeNull();
    expect(verifyState(SECRET, undefined, NOW)).toBeNull();
    expect(verifyState(SECRET, `${state}.more`, NOW)).toBeNull();
  });

  it('refuses an expired state', () => {
    const state = signState(SECRET, { provider: 'meta', userId: 'u1' }, NOW);
    expect(verifyState(SECRET, state, NOW + STATE_LIFETIME_MS - 1)).not.toBeNull();
    expect(verifyState(SECRET, state, NOW + STATE_LIFETIME_MS + 1)).toBeNull();
  });
});
