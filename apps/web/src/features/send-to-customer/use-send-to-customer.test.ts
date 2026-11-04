import { afterEach, describe, expect, it, vi } from 'vitest';
import { newPressId } from './use-send-to-customer';

describe('newPressId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a uuid, with or without crypto.randomUUID (an insecure origin has none)', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newPressId()).toMatch(/^[0-9a-f-]{36}$/);
    vi.stubGlobal('crypto', {});
    expect(newPressId()).toMatch(uuid);
    expect(newPressId()).not.toBe(newPressId());
  });
});
