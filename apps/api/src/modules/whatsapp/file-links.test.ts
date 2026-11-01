import { describe, expect, it } from 'vitest';
import { readFileLink, signFileLink } from './file-links';

describe('shared file links', () => {
  const file = { kind: 'receipt', id: 'p1', customerId: 'c1', exp: 2_000_000_000 } as const;

  it('opens with the right secret before it expires', () => {
    const token = signFileLink('a-long-secret-value', file);
    expect(readFileLink('a-long-secret-value', token, 1_000_000_000_000)).toEqual(file);
  });

  it('refuses a changed, foreign or expired link', () => {
    const token = signFileLink('a-long-secret-value', file);
    expect(readFileLink('another-secret-value', token)).toBeNull();
    expect(readFileLink('a-long-secret-value', `x${token}`)).toBeNull();
    expect(readFileLink('a-long-secret-value', token, 2_000_000_001_000)).toBeNull();
  });
});
