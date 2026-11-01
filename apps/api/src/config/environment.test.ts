import { describe, expect, it } from 'vitest';
import { loadEnvironment } from './environment';

const base = {
  DATABASE_URL: 'postgres://x:y@localhost:5432/oneohm',
  FILE_LINK_SECRET: 'a-real-secret-for-files-0123456789',
  STORAGE_ACCESS_KEY: 'real-access-key',
  STORAGE_SECRET_KEY: 'real-secret-key',
};

describe('payment settings safety', () => {
  it('needs the RazorpayX account number for live payouts', () => {
    expect(() =>
      loadEnvironment({
        ...base,
        RAZORPAYX_MODE: 'live',
        RAZORPAY_KEY_ID: 'rzp_test_x',
        RAZORPAY_KEY_SECRET: 's',
      }),
    ).toThrow(/RAZORPAYX_ACCOUNT_NUMBER/);
  });

  it('refuses test keys and the payout sandbox on the real server', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      OTP_PROVIDER: 'msg91',
      MSG91_AUTH_KEY: 'k',
      MSG91_SENDER_ID: 'ONEOHM',
      MSG91_LOGIN_TEMPLATE_ID: 't',
      RAZORPAY_MODE: 'live',
      RAZORPAY_KEY_ID: 'rzp_test_abc',
      RAZORPAY_KEY_SECRET: 's',
      RAZORPAY_WEBHOOK_SECRET: 'w',
      RAZORPAYX_MODE: 'sandbox',
    };
    expect(() => loadEnvironment(production)).toThrow(/rzp_live_/);
    expect(() => loadEnvironment(production)).toThrow(/payout sandbox/);
  });

  it('allows the sandbox on a laptop', () => {
    expect(loadEnvironment({ ...base, RAZORPAYX_MODE: 'sandbox' }).RAZORPAYX_MODE).toBe('sandbox');
  });
});
