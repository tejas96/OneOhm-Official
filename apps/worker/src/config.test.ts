import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = { DATABASE_URL: 'postgres://x', NODE_ENV: 'production' };
const real = {
  FILE_LINK_SECRET: 'a-real-secret-for-files-0123456789',
  PAY_LINK_SECRET: 'a-real-secret-for-pay-links-0123456789',
};

describe('worker secrets in production', () => {
  it('starts with real secrets', () => {
    expect(loadConfig({ ...base, ...real }).NODE_ENV).toBe('production');
  });

  it('refuses the default file-link secret', () => {
    expect(() => loadConfig({ ...base, PAY_LINK_SECRET: real.PAY_LINK_SECRET })).toThrow(
      /FILE_LINK_SECRET/,
    );
  });

  it('needs a separate pay-link secret', () => {
    expect(() => loadConfig({ ...base, FILE_LINK_SECRET: real.FILE_LINK_SECRET })).toThrow(
      /PAY_LINK_SECRET/,
    );
    expect(() => loadConfig({ ...base, ...real, PAY_LINK_SECRET: real.FILE_LINK_SECRET })).toThrow(
      /PAY_LINK_SECRET/,
    );
  });

  it('is relaxed on a laptop', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://x' }).FILE_LINK_SECRET).toContain('local');
  });
});

describe('marketing settings in production', () => {
  const prod = { ...base, ...real };

  it('refuses sandbox mode', () => {
    expect(() => loadConfig({ ...prod, MARKETING_MODE: 'sandbox' })).toThrow(/MARKETING_MODE/);
  });

  it('needs a real secret key once Meta or Google is set up', () => {
    expect(() => loadConfig({ ...prod, META_APP_ID: '123' })).toThrow(/MARKETING_SECRET_KEY/);
    expect(() => loadConfig({ ...prod, GOOGLE_ADS_CLIENT_ID: 'x' })).toThrow(
      /MARKETING_SECRET_KEY/,
    );
    expect(() =>
      loadConfig({
        ...prod,
        META_APP_ID: '1',
        MARKETING_SECRET_KEY: 'oneohm-local-marketing-secret',
      }),
    ).toThrow(/MARKETING_SECRET_KEY/);
    expect(
      loadConfig({
        ...prod,
        META_APP_ID: '1',
        MARKETING_SECRET_KEY: 'a-real-marketing-secret-0123456789',
      }).META_APP_ID,
    ).toBe('1');
  });

  it('is fine without Meta or Google, with defaults', () => {
    const config = loadConfig(prod);
    expect(config.MARKETING_MODE).toBe('live');
    expect(config.META_GRAPH_VERSION).toBe('v26.0');
    expect(config.GOOGLE_ADS_API_VERSION).toBe('v26');
    expect(config.API_PUBLIC_URL).toBe('http://localhost:4200');
  });
});
