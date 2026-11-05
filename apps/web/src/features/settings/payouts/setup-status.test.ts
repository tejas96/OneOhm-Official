import type { PayoutIp, PayoutSetup } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { lowBalanceOpen, setupChecks, setupStatus } from './setup-status';

const base: PayoutSetup & PayoutIp = {
  serverIp: null,
  ipBlocked: false,
  mode: 'live',
  accountNumberSet: true,
  keysSet: true,
  keysAreTest: false,
  webhookSecretSet: true,
  lastWebhookAt: '2026-11-05T05:00:00.000Z',
  lastCheckAt: '2026-11-05T05:05:00.000Z',
  lastCheckError: null,
  openPayouts: 1,
  stuckPayouts: 0,
  lastLowBalanceAt: null,
  lastGoodPayoutAt: null,
};
const tone = (setup: PayoutSetup & PayoutIp, key: string) =>
  setupChecks(setup).find((check) => check.key === key)?.tone;

describe('setupStatus', () => {
  it('names the four states', () => {
    expect(setupStatus({ mode: 'off', keysAreTest: false })).toBe('off');
    expect(setupStatus({ mode: 'sandbox', keysAreTest: true })).toBe('practice');
    expect(setupStatus({ mode: 'live', keysAreTest: true })).toBe('liveTest');
    expect(setupStatus({ mode: 'live', keysAreTest: false })).toBe('live');
  });
});

describe('setupChecks', () => {
  it('is all good for a complete live setup', () => {
    expect(setupChecks(base).every((check) => check.tone === 'ok')).toBe(true);
  });
  it('warns about test keys in live mode', () => {
    expect(tone({ ...base, keysAreTest: true }, 'keys')).toBe('warn');
  });
  it('warns about a missing webhook secret and no webhook yet in live mode only', () => {
    const missing = { ...base, webhookSecretSet: false, lastWebhookAt: null };
    expect(tone(missing, 'webhookSecret')).toBe('warn');
    expect(tone(missing, 'lastWebhook')).toBe('warn');
    expect(tone({ ...missing, mode: 'sandbox' }, 'webhookSecret')).toBe('idle');
  });
  it('warns on a failed check and on stuck transfers', () => {
    expect(tone({ ...base, lastCheckError: 'Bad key' }, 'lastCheck')).toBe('warn');
    expect(tone({ ...base, stuckPayouts: 2 }, 'openPayouts')).toBe('warn');
  });
  it('shows nothing needed while off', () => {
    const off = { ...base, mode: 'off' as const, accountNumberSet: false, keysSet: false };
    expect(tone(off, 'accountNumber')).toBe('idle');
    expect(tone(off, 'keys')).toBe('idle');
  });
});

describe('lowBalanceOpen', () => {
  it('stays open until a good payout comes after it', () => {
    expect(lowBalanceOpen({ lastLowBalanceAt: null, lastGoodPayoutAt: null })).toBe(false);
    expect(
      lowBalanceOpen({ lastLowBalanceAt: '2026-11-05T05:00:00Z', lastGoodPayoutAt: null }),
    ).toBe(true);
    expect(
      lowBalanceOpen({
        lastLowBalanceAt: '2026-11-05T05:00:00Z',
        lastGoodPayoutAt: '2026-11-05T06:00:00Z',
      }),
    ).toBe(false);
  });
});

describe('allow-list check', () => {
  it('appears, as Check, only when RazorpayX refused this server', () => {
    expect(tone(base, 'allowList')).toBeUndefined();
    expect(tone({ ...base, ipBlocked: true }, 'allowList')).toBe('warn');
  });
});
