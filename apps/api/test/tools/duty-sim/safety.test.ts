import { describe, expect, it } from 'vitest';
import { safeApiUrl } from './safety';

describe('safeApiUrl', () => {
  it('takes the acceptance API on port 4300 by default', () => {
    expect(safeApiUrl(undefined)).toBe('http://localhost:4300/v1');
    expect(safeApiUrl('http://127.0.0.1:4300')).toBe('http://127.0.0.1:4300/v1');
  });

  it.each([
    'http://localhost:4200',
    'http://localhost:3000',
    'http://localhost',
    'https://localhost:4300',
    'http://example.com:4300',
    'http://[::1]:4300',
    'http://10.0.0.5:4300',
  ])('refuses %s', (url) => {
    expect(() => safeApiUrl(url)).toThrow();
  });
});
