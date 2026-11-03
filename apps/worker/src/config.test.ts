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
