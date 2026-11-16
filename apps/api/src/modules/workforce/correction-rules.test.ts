import { describe, expect, it } from 'vitest';
import { PENDING_INDEX, pendingClash } from './correction-rules';

describe('pendingClash', () => {
  it('turns the pending-day index refusal into a friendly conflict', () => {
    const clash = pendingClash({ code: '23505', constraint_name: PENDING_INDEX });
    expect(clash?.message).toMatch(/already have a correction waiting/);
    expect(clash?.status).toBe(409);
  });

  it('finds the refusal inside a wrapped driver error', () => {
    const wrapped = new Error('Failed query', {
      cause: { code: '23505', constraint: PENDING_INDEX },
    });
    expect(pendingClash(wrapped)).not.toBeNull();
  });

  it('leaves every other error alone', () => {
    expect(pendingClash({ code: '23505', constraint_name: 'other_unique' })).toBeNull();
    expect(pendingClash(new Error('boom'))).toBeNull();
  });
});
