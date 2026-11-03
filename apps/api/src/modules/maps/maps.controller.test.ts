import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../config/environment';
import { browserKeyFrom, mapsConfigFor } from './maps.controller';

const base = { DATABASE_URL: 'postgres://x', NODE_ENV: 'test' } as NodeJS.ProcessEnv;
const keyFor = (extra: Record<string, string>) =>
  browserKeyFrom(loadEnvironment({ ...base, ...extra }));

describe('maps config key', () => {
  it('is null when no key is set', () => {
    expect(keyFor({})).toBeNull();
  });
  it('treats blank values as not set', () => {
    expect(keyFor({ GOOGLE_MAPS_API_KEY: '', GOOGLE_MAPS_BROWSER_KEY: '' })).toBeNull();
  });
  it('falls back to the shared key', () => {
    expect(keyFor({ GOOGLE_MAPS_API_KEY: 'k' })).toBe('k');
  });
  it('prefers the browser key', () => {
    expect(keyFor({ GOOGLE_MAPS_API_KEY: 'k', GOOGLE_MAPS_BROWSER_KEY: 'b' })).toBe('b');
  });
});

describe('maps config access', () => {
  const env = loadEnvironment({ ...base, GOOGLE_MAPS_API_KEY: 'k' });
  it('gives staff the key', () => {
    expect(mapsConfigFor({ kind: 'staff' }, env)).toEqual({ browserKey: 'k' });
  });
  it.each(['partner', 'reseller'] as const)('refuses a %s', (kind) => {
    expect(() => mapsConfigFor({ kind }, env)).toThrow();
  });
});
