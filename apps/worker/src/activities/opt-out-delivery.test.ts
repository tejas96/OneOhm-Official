import { type Database, type outbox, waConversations } from '@oneohm/database';
import { describe, expect, it } from 'vitest';
import type { PushSender } from '../channels/expo-push';
import type { SmsSender } from '../channels/sms';
import type { WhatsAppSender } from '../channels/whatsapp-cloud';
import { deliveryActivities } from './delivery.activities';

type Row = typeof outbox.$inferSelect;

const template = (): Row => ({
  id: 'r1',
  channel: 'whatsapp',
  recipient: '+919800000001',
  template: 'service_update',
  payload: { customer: 'Asha', topic: 'Visit', status: 'Booked' },
  dedupeKey: 'k',
  status: 'pending',
  attempts: 0,
  startedAt: null,
  lastError: null,
  sentAt: null,
  providerMessageId: null,
  deliveryStatus: null,
  deliveredAt: null,
  readAt: null,
  createdAt: new Date(),
});

/** The outbox row, and a chat for the number that is opted out or not; writes are recorded. */
function setup(optedOutAt: Date | null) {
  const writes: Record<string, unknown>[] = [];
  const sent: string[] = [];
  const row = template();
  const query = (result: unknown[]) => {
    const q = {
      from: (table: unknown) => query(table === waConversations ? [{ optedOutAt }] : result),
      where: () => q,
      limit: async () => (result.length > 0 && 'optedOutAt' in (result[0] as object) ? result : []),
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
  const sender = {
    send: async (message: { toE164: string }) => {
      sent.push(message.toE164);
      return { outcome: 'sent', providerId: 'p1' };
    },
  } as unknown as WhatsAppSender;
  const activities = deliveryActivities({
    db: db as unknown as Database,
    sender,
    push: {} as PushSender,
    sms: {} as SmsSender,
    language: 'en',
  });
  return { writes, sent, activities };
}

describe('a template to a number that asked to stop', () => {
  it('is skipped with a plain note and never sent', async () => {
    const { writes, sent, activities } = setup(new Date());
    expect(await activities.deliverOutboxMessage('r1')).toBe('skipped');
    expect(sent).toEqual([]);
    expect(writes.at(-1)).toMatchObject({
      status: 'skipped',
      lastError: 'The person asked not to get WhatsApp messages',
    });
  });

  it('is sent once the number has started again', async () => {
    const { sent, activities } = setup(null);
    expect(await activities.deliverOutboxMessage('r1')).toBe('sent');
    expect(sent).toEqual(['+919800000001']);
  });
});
