import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashEmail, hashPhoneFor, phoneDigits } from './hashing';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('hashing for Meta and Google', () => {
  it('normalises Indian numbers with the country code', () => {
    expect(phoneDigits('+91 98765-43210')).toBe('919876543210');
    expect(phoneDigits('98765 43210')).toBe('919876543210');
    expect(phoneDigits('098765 43210')).toBe('919876543210');
  });

  it('keeps a foreign number with "+" as it is', () => {
    expect(phoneDigits('+65 9123 4567')).toBe('6591234567');
    expect(phoneDigits('+1 415 555 0100')).toBe('14155550100');
  });

  it('hashes digits for Meta and E.164 with "+" for Google', () => {
    expect(hashPhoneFor('meta', '+919876543210')).toBe(sha('919876543210'));
    expect(hashPhoneFor('google', '+919876543210')).toBe(sha('+919876543210'));
  });

  it('hashes a trimmed lower-case email, and nothing for empty', () => {
    expect(hashEmail('  Asha@Example.COM ')).toBe(sha('asha@example.com'));
    expect(hashEmail('')).toBeNull();
  });
});
