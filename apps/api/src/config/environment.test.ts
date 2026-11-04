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
      MSG91_PASSWORD_RESET_TEMPLATE_ID: 'r',
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

describe('msg91 settings', () => {
  it('msg91 needs the reset template', () => {
    expect(() =>
      loadEnvironment({
        ...base,
        OTP_PROVIDER: 'msg91',
        MSG91_AUTH_KEY: 'k',
        MSG91_LOGIN_TEMPLATE_ID: 't',
      }),
    ).toThrow(/MSG91_PASSWORD_RESET_TEMPLATE_ID/);
  });
});

describe('production start-up checks', () => {
  const production = {
    ...base,
    NODE_ENV: 'production',
    OTP_PROVIDER: 'msg91',
    MSG91_AUTH_KEY: 'k',
    MSG91_SENDER_ID: 'ONEOHM',
    MSG91_LOGIN_TEMPLATE_ID: 't',
    MSG91_PASSWORD_RESET_TEMPLATE_ID: 'r',
    PAY_LINK_SECRET: 'a-real-secret-for-pay-links-0123456789',
    API_PUBLIC_URL: 'https://app.oneohm.in',
  };

  it('accepts a complete production setting', () => {
    expect(loadEnvironment(production).NODE_ENV).toBe('production');
  });

  it('refuses live WhatsApp without the app secret', () => {
    const live = {
      ...production,
      WHATSAPP_DELIVERY: 'live',
      WHATSAPP_ACCESS_TOKEN: 't',
    };
    expect(() => loadEnvironment(live)).toThrow(/WHATSAPP_APP_SECRET/);
    expect(loadEnvironment({ ...live, WHATSAPP_APP_SECRET: 's' }).WHATSAPP_DELIVERY).toBe('live');
  });

  it('refuses the default file-link secret', () => {
    const { FILE_LINK_SECRET: _omitted, ...withoutSecret } = production;
    expect(() => loadEnvironment(withoutSecret)).toThrow(/FILE_LINK_SECRET/);
  });

  it('needs its own pay-link secret', () => {
    const { PAY_LINK_SECRET: _omitted, ...withoutPay } = production;
    expect(() => loadEnvironment(withoutPay)).toThrow(/PAY_LINK_SECRET/);
    expect(() =>
      loadEnvironment({
        ...production,
        PAY_LINK_SECRET: production.FILE_LINK_SECRET,
      }),
    ).toThrow(/PAY_LINK_SECRET/);
  });

  it.each([
    'http://app.oneohm.in',
    'https://localhost:4200',
    'https://abc-def.trycloudflare.com',
    'https://oneohm.loca.lt',
  ])('refuses the public address %s', (url) => {
    expect(() => loadEnvironment({ ...production, API_PUBLIC_URL: url })).toThrow(/API_PUBLIC_URL/);
  });

  it('needs a real field-app address once staff invites are on', () => {
    expect(() => loadEnvironment({ ...production, STAFF_INVITES: 'on' })).toThrow(/FIELD_APP_URL/);
    expect(() =>
      loadEnvironment({
        ...production,
        STAFF_INVITES: 'on',
        FIELD_APP_URL: 'http://10.0.0.5:8081',
      }),
    ).toThrow(/FIELD_APP_URL/);
    const on = { ...production, STAFF_INVITES: 'on', FIELD_APP_URL: 'https://field.oneohm.in' };
    expect(loadEnvironment(on).STAFF_INVITES).toBe('on');
    expect(loadEnvironment(production).STAFF_INVITES).toBe('off');
  });

  it('leaves a laptop alone', () => {
    const laptop = {
      DATABASE_URL: base.DATABASE_URL,
      WHATSAPP_DELIVERY: 'log',
    };
    expect(loadEnvironment(laptop).API_PUBLIC_URL).toBe('http://localhost:4200');
  });
});
