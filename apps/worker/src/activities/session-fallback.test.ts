import {
  customers,
  type Database,
  messageTemplates,
  type outbox,
  waConversations,
} from '@oneohm/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushSender } from '../channels/expo-push';
import { PermanentSendError } from '../channels/send-errors';
import type { SmsSender } from '../channels/sms';
import type { WhatsAppSender } from '../channels/whatsapp-cloud';
import { deliveryActivities } from './delivery.activities';
import { WINDOW_CLOSED_CODE } from './send-checks';

const queued = vi.hoisted(() => [] as { dedupeKey: string; payload: unknown }[]);
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  tellChatSendFailed: async () => undefined,
  queueFallback: async (_db: unknown, row: { dedupeKey: string; payload: unknown }) => {
    queued.push(row);
    return 'whatsapp';
  },
}));

vi.mock('./flow-fallback', () => ({ queueFlowFallback: async () => undefined }));

type Row = typeof outbox.$inferSelect;

const fallback = { template: 'payment_received', payload: { amount: '₹10' }, dedupeKey: 'pay:1' };
const sessionRow = (payload: object = { kind: 'text', body: 'Hi', fallback }): Row => ({
  id: 'r1',
  channel: 'whatsapp',
  recipient: '+919800000001',
  template: 'session:text',
  payload,
  dedupeKey: 'paid_next:1',
  status: 'pending',
  attempts: 0,
  startedAt: null,
  lastError: null,
  sentAt: null,
  providerMessageId: null,
  deliveryStatus: null,
  deliveredAt: null,
  readAt: null,
  notBefore: null,
  createdAt: new Date(),
});

function setup(
  message: Row,
  options: { open: boolean; sessionError?: Error; configs?: object[][] },
) {
  const writes: Record<string, unknown>[] = [];
  const chat = [{ lastInboundAt: options.open ? new Date() : new Date(0), optedOutAt: null }];
  const query = (result: unknown[]) => {
    const q = {
      from: (table: unknown) => {
        if (table === waConversations) return query(chat);
        if (table === customers) return query([]);
        if (table === messageTemplates) return query(options.configs?.shift() ?? []);
        return query(result);
      },
      where: () => q,
      orderBy: () => q,
      limit: async () => result,
      returning: async () => [message],
      // biome-ignore lint/suspicious/noThenProperty: a drizzle query is awaited as is.
      then: (done: (rows: unknown[]) => unknown) => Promise.resolve(result).then(done),
    };
    return q;
  };
  const db = {
    select: () => query([message]),
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
    send: async () => ({ outcome: 'sent', providerId: 'p1' }),
    sendSession: async () => {
      if (options.sessionError) throw options.sessionError;
      return { outcome: 'sent', providerId: 'p2' };
    },
  } as unknown as WhatsAppSender;
  const activities = deliveryActivities({
    db: db as unknown as Database,
    sender,
    push: {} as PushSender,
    sms: {} as SmsSender,
    language: 'en',
  });
  return { writes, activities };
}

describe('a chat message whose window is closed', () => {
  beforeEach(() => {
    queued.length = 0;
  });

  it('checked before sending: queues the fallback template and skips the row', async () => {
    const { writes, activities } = setup(sessionRow(), { open: false });
    expect(await activities.deliverOutboxMessage('r1')).toBe('skipped');
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toMatchObject({ fallback });
    expect(queued[0]?.dedupeKey).toBe('paid_next:1');
    expect(writes.at(-1)).toMatchObject({ status: 'skipped' });
    expect(String(writes.at(-1)?.lastError)).toContain('chat window closed');
  });

  it('refused by Meta (131047) at send time: the same fallback, row skipped not failed', async () => {
    const { writes, activities } = setup(sessionRow(), {
      open: true,
      sessionError: new PermanentSendError('re-engagement', WINDOW_CLOSED_CODE),
    });
    expect(await activities.deliverOutboxMessage('r1')).toBe('skipped');
    expect(queued).toHaveLength(1);
    expect(writes.at(-1)).toMatchObject({ status: 'skipped' });
  });

  it('without a fallback still fails visibly', async () => {
    const { writes, activities } = setup(sessionRow({ kind: 'text', body: 'Hi' }), { open: false });
    expect(await activities.deliverOutboxMessage('r1')).toBe('failed');
    expect(queued).toEqual([]);
    expect(writes.some((w) => w.status === 'failed')).toBe(true);
  });

  const converted = (): Row => ({
    ...sessionRow({
      project: 'OH-1',
      milestone: 'Net meter fitted',
      step: 'net_meter_installation',
      language: 'mr-IN',
    }),
    template: 'project_milestone',
    dedupeKey: 'plain:1',
  });

  it('a template turned into a chat message keeps itself as the fallback', async () => {
    const { writes, activities } = setup(converted(), { open: true });
    expect(await activities.deliverOutboxMessage('r1')).toBe('sent');
    const stored = writes.find((w) => w.payload)?.payload;
    expect(stored).toMatchObject({
      fallback: { template: 'project_milestone', payload: { project: 'OH-1', language: 'mr-IN' } },
    });
    expect(stored).not.toHaveProperty('fallback.payload.fallback');
  });

  it('when the window just closed and the template is switched off, the row is skipped', async () => {
    const { writes, activities } = setup(converted(), {
      open: true,
      sessionError: new PermanentSendError('re-engagement', WINDOW_CLOSED_CODE),
      // The switch is on when the chat message is chosen, off when the template is wanted.
      configs: [[], [{ key: 'project_milestone', active: false }]],
    });
    expect(await activities.deliverOutboxMessage('r1')).toBe('skipped');
    expect(writes.at(-1)).toMatchObject({ status: 'skipped' });
  });
});
