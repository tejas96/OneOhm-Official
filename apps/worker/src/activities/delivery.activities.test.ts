import type { Database, outbox } from '@oneohm/database';
import { describe, expect, it } from 'vitest';
import type { PushSender } from '../channels/expo-push';
import { MAYBE_SENT } from '../channels/send-errors';
import type { SmsSender } from '../channels/sms';
import type { WhatsAppSender } from '../channels/whatsapp-cloud';
import { deliveryActivities, SENDING } from './delivery.activities';

type Row = typeof outbox.$inferSelect;

const smsRow = (lastError: string | null = null): Row => ({
  id: 'r1',
  channel: 'sms',
  recipient: '+919800000000',
  template: 'payment_link',
  payload: { text: 'Pay now' },
  dedupeKey: 'k',
  status: 'pending',
  attempts: lastError ? 1 : 0,
  startedAt: null,
  lastError,
  sentAt: null,
  providerMessageId: null,
  deliveryStatus: null,
  deliveredAt: null,
  readAt: null,
  createdAt: new Date(),
});

/** Reads give the one row (lookups with a limit find nothing); writes are recorded. */
function fakeDb(row: Row) {
  const writes: Record<string, unknown>[] = [];
  const query = (result: unknown[]) => {
    const q = {
      from: () => q,
      where: () => q,
      limit: async () => [],
      returning: async () => [{ id: row.id }],
      // biome-ignore lint/suspicious/noThenProperty: a drizzle query is awaited as is.
      then: (done: (rows: unknown[]) => unknown) => Promise.resolve(result).then(done),
    };
    return q;
  };
  const db = {
    select: () => query([row]),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        writes.push(values);
        return query([]);
      },
    }),
    insert: () => ({ values: () => query([]) }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { writes, db: db as unknown as Database };
}

function activitiesFor(row: Row, send: SmsSender['send']) {
  const fake = fakeDb(row);
  const activities = deliveryActivities({
    db: fake.db,
    sender: {} as WhatsAppSender,
    push: {} as PushSender,
    sms: { send },
    language: 'en',
  });
  return { ...fake, activities };
}

describe('deliverOutboxMessage crash guard', () => {
  it('marks the row as sending right before the call, and notes when it started', async () => {
    let seenBeforeSend: Record<string, unknown>[] = [];
    const { writes, activities } = activitiesFor(smsRow(), async () => {
      seenBeforeSend = [...writes];
      return { outcome: 'sent', providerId: 'p1' };
    });
    expect(await activities.deliverOutboxMessage('r1')).toBe('sent');
    expect(seenBeforeSend[0]?.startedAt).toBeInstanceOf(Date);
    expect(seenBeforeSend.at(-1)).toEqual({ lastError: SENDING });
    expect(writes.at(-1)).toMatchObject({ status: 'sent', lastError: null });
  });

  it('never sends again after an attempt died mid-send', async () => {
    let calls = 0;
    const { writes, activities } = activitiesFor(smsRow(SENDING), async () => {
      calls += 1;
      return { outcome: 'sent', providerId: 'p1' };
    });
    expect(await activities.deliverOutboxMessage('r1')).toBe('failed');
    expect(calls).toBe(0);
    expect(writes.at(-1)).toEqual({ status: 'failed', lastError: MAYBE_SENT });
  });

  it('a retryable failure replaces the marker with its reason', async () => {
    const { writes, activities } = activitiesFor(smsRow(), async () => {
      throw new Error('SMS 503: busy');
    });
    await expect(activities.deliverOutboxMessage('r1')).rejects.toThrow('SMS 503: busy');
    expect(writes.at(-1)).toEqual({ lastError: 'SMS 503: busy' });
  });
});
