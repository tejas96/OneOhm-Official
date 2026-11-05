import { rightsForAsk } from '@oneohm/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../common/auth/actor';

const closePlain = vi.fn(async () => undefined);
vi.mock('../documents/document-request-in-person', () => ({
  closePlain: (...args: unknown[]) => closePlain(...(args as [])),
}));
vi.mock('../documents/document-request-read', () => ({
  readRequests: async () => [{ id: 'ask-1', type: 'paper', kind: null, status: 'open' }],
}));
vi.mock('../../common/audit', () => ({ recordAudit: async () => undefined }));

import { CustomerContactService } from './customer-contact.service';

const actorWith = (capabilities: string[]) =>
  ({ userId: 'u1', capabilities: new Set(capabilities) }) as unknown as Actor;

/** A database whose transaction hands the callback a tx that "ticks" one task of ask-1. */
const fakeDb = () => {
  const tx = {
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => [{ id: 'h1', actionId: 'ask-1' }] }),
      }),
    }),
  };
  return {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
            }),
          }),
        }),
      }),
    }),
  };
};

describe('ticking a handover task closes its ask only for someone who may', () => {
  beforeEach(() => closePlain.mockClear());

  it('needs the rights of the ask, like closing it in person', async () => {
    const service = new CustomerContactService(fakeDb() as never);
    // customers.manage ticks the task but is not the right to close a paper ask.
    await expect(
      service.complete(actorWith(['customers.manage']), 'h1', undefined),
    ).rejects.toThrow();
    expect(closePlain).not.toHaveBeenCalled();
  });

  it('closes the ask for a person with one of its rights', async () => {
    const right = rightsForAsk('paper')[0] ?? '';
    const service = new CustomerContactService(fakeDb() as never);
    await service
      .complete(actorWith(['customers.manage', right]), 'h1', undefined)
      .catch(() => undefined);
    expect(closePlain).toHaveBeenCalledTimes(1);
  });
});
