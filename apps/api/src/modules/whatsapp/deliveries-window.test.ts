import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../../config/core.module';

const queued = vi.hoisted(() => [] as unknown[]);
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  queueFallback: async (_db: unknown, row: unknown) => {
    queued.push(row);
    return 'whatsapp';
  },
  tellChatSendFailed: async () => undefined,
}));

import { DeliveriesService } from './deliveries.service';

const fallback = { template: 'payment_received', payload: { amount: '₹10' } };

/** One outbox row found by its provider ID; records what is written to it. */
function serviceFor(payload: unknown) {
  const writes: Record<string, unknown>[] = [];
  const row = {
    id: 'o1',
    deliveryStatus: 'sent',
    template: 'session:text',
    recipient: '+919800000001',
    dedupeKey: 'paid_next:1',
    payload,
  };
  const query = (result: unknown[]) => {
    const q = {
      from: () => q,
      where: () => q,
      limit: async () => result,
    };
    return q;
  };
  const db = {
    select: () => query([row]),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        writes.push(values);
        return { where: async () => undefined };
      },
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { writes, service: new DeliveriesService(db as unknown as Database) };
}

const failed = (errorCode: number | null) => ({
  providerMessageId: 'wamid.1',
  status: 'failed' as const,
  at: new Date(),
  error: 'Re-engagement message',
  errorCode,
});

describe('a chat message Meta reports as refused because the window closed', () => {
  it('queues its fallback template and marks the row skipped, not failed', async () => {
    queued.length = 0;
    const { writes, service } = serviceFor({ kind: 'text', body: 'Hi', fallback });
    expect(await service.applyUpdates([failed(131047)])).toBe(1);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ dedupeKey: 'paid_next:1' });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ status: 'skipped' });
  });

  it('without a fallback, or for another error, it fails as before', async () => {
    queued.length = 0;
    const plain = serviceFor({ kind: 'text', body: 'Hi' });
    await plain.service.applyUpdates([failed(131047)]);
    const other = serviceFor({ kind: 'text', body: 'Hi', fallback });
    await other.service.applyUpdates([failed(131000)]);
    expect(queued).toEqual([]);
    expect(plain.writes[0]).toMatchObject({ status: 'failed' });
    expect(other.writes[0]).toMatchObject({ status: 'failed' });
  });
});
