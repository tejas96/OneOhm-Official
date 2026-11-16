import { beforeEach, describe, expect, it, vi } from 'vitest';

const managers = vi.hoisted(() => ({ managerIdsOf: vi.fn() }));
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  ...managers,
}));

import { actor } from './site-visit-test-kit';
import { assertMayDecideClaim, assertMayVoidClaim } from './travel-claim-people';

const withManagers = (ids: string[]) =>
  managers.managerIdsOf.mockResolvedValue(new Map([['worker', ids]]));
const check = (who: ReturnType<typeof actor>) => assertMayDecideClaim({} as never, who, 'worker');

beforeEach(() => vi.clearAllMocks());

describe('who may decide a travel claim (S10)', () => {
  it('lets the manager, or whoever covers the manager', async () => {
    withManagers(['boss', 'cover']);
    await expect(check(actor('boss'))).resolves.toBeUndefined();
    await expect(check(actor('cover'))).resolves.toBeUndefined();
  });

  it('lets HR and finance', async () => {
    withManagers([]);
    await expect(check(actor('hr', ['people.manage']))).resolves.toBeUndefined();
    await expect(check(actor('fin', ['finance.record_payments']))).resolves.toBeUndefined();
  });

  it('refuses a plain leave approver with a 403', async () => {
    withManagers(['boss']);
    await expect(check(actor('peer', ['leave.approve']))).rejects.toMatchObject({ status: 403 });
  });

  it('refuses the person themselves with a 409, even as HR', async () => {
    withManagers(['boss']);
    await expect(check(actor('worker', ['people.manage']))).rejects.toMatchObject({
      status: 409,
      code: 'own',
    });
  });
});

describe('who may void an approved claim (S9, S10)', () => {
  it('lets finance and HR', () => {
    expect(() =>
      assertMayVoidClaim(actor('fin', ['finance.record_payments']), 'worker'),
    ).not.toThrow();
    expect(() =>
      assertMayVoidClaim(actor('fin', ['finance.approve_payments']), 'worker'),
    ).not.toThrow();
    expect(() => assertMayVoidClaim(actor('hr', ['people.manage']), 'worker')).not.toThrow();
  });

  it('refuses the reporting manager, who may only approve or reject', () => {
    expect(() => assertMayVoidClaim(actor('boss', ['leave.approve']), 'worker')).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('refuses the person themselves, even as finance', () => {
    expect(() => assertMayVoidClaim(actor('worker', ['people.manage']), 'worker')).toThrow(
      expect.objectContaining({ status: 409, code: 'own' }),
    );
  });
});
