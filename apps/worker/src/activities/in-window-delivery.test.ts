import {
  customers,
  type Database,
  messageTemplates,
  type outbox,
  waConversations,
} from '@oneohm/database';
import { describe, expect, it } from 'vitest';
import type { PushSender } from '../channels/expo-push';
import { PermanentSendError } from '../channels/send-errors';
import type { SmsSender } from '../channels/sms';
import type { SessionMessage, WhatsAppSender } from '../channels/whatsapp-cloud';
import { deliveryActivities } from './delivery.activities';
import { WINDOW_CLOSED_CODE } from './send-checks';

type Row = typeof outbox.$inferSelect;

const row = (template: string, payload: Record<string, string>, dedupeKey = 'k'): Row => ({
  id: 'r1',
  channel: 'whatsapp',
  recipient: '+919800000001',
  template,
  payload,
  dedupeKey,
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

interface Setup {
  readonly lastInboundAt?: Date | null;
  readonly optedOutAt?: Date | null;
  readonly config?: Record<string, unknown>[];
  readonly sessionError?: Error;
}

/** Tables answer by name: the outbox row, the chat, the template settings. */
function setup(message: Row, options: Setup = {}) {
  const sessions: SessionMessage[] = [];
  const templates: { template: string; language: string }[] = [];
  const writes: Record<string, unknown>[] = [];
  const chat = [
    {
      lastInboundAt: 'lastInboundAt' in options ? options.lastInboundAt : new Date(),
      optedOutAt: options.optedOutAt ?? null,
    },
  ];
  const query = (result: unknown[]) => {
    const q = {
      from: (table: unknown) => {
        if (table === waConversations) return query(chat);
        if (table === customers) return query([]);
        if (table === messageTemplates) return query(options.config ?? []);
        return query(result);
      },
      where: () => q,
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
    send: async (sent: { template: string; language: string }) => {
      templates.push({ template: sent.template, language: sent.language });
      return { outcome: 'sent', providerId: 'p1' };
    },
    sendSession: async (_to: string, sent: SessionMessage) => {
      if (options.sessionError) throw options.sessionError;
      sessions.push(sent);
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
  return { sessions, templates, writes, activities };
}

const update = (language: string) =>
  row('project_milestone', {
    customer: 'Asha',
    project: 'OH-1',
    milestone: 'Net meter fitted',
    step: 'net_meter_installation',
    language,
  });

describe('a template to a Marathi customer with the chat open', () => {
  it('goes as a chat message in Marathi when no Marathi template exists', async () => {
    const { sessions, templates, activities } = setup(update('mr-IN'));
    expect(await activities.deliverOutboxMessage('r1')).toBe('sent');
    expect(templates).toEqual([]);
    expect(sessions).toEqual([
      { kind: 'text', body: 'तुमच्या सोलर प्रकल्पाची (OH-1) नवी माहिती: नेट मीटर बसवला.' },
    ]);
  });

  it('says several merged steps in Hindi, one by one', async () => {
    const merged = row('project_milestone', {
      project: 'OH-1',
      milestone: 'Net meter fitted; Inspection',
      milestones: 'Net meter fitted; Inspection',
      steps: 'net_meter_installation,unknown_step',
      language: 'hi-IN',
    });
    const { sessions, activities } = setup(merged);
    await activities.deliverOutboxMessage('r1');
    expect(sessions[0]).toMatchObject({ kind: 'text' });
    expect((sessions[0] as { body: string }).body).toContain('; Inspection');
    expect((sessions[0] as { body: string }).body).not.toContain('Net meter fitted');
  });

  it('stays a template once the chat window is closed', async () => {
    const stale = new Date(Date.now() - 30 * 3600_000);
    const { sessions, templates, activities } = setup(update('mr-IN'), { lastInboundAt: stale });
    expect(await activities.deliverOutboxMessage('r1')).toBe('sent');
    expect(sessions).toEqual([]);
    expect(templates).toHaveLength(1);
  });

  it('stays a template when the template exists in Marathi', async () => {
    const { sessions, templates, activities } = setup(update('mr-IN'), {
      config: [{ key: 'project_milestone', metaNameMr: 'project_milestone_mr', active: true }],
    });
    await activities.deliverOutboxMessage('r1');
    expect(sessions).toEqual([]);
    expect(templates).toEqual([{ template: 'project_milestone_mr', language: 'mr' }]);
  });

  it('stays English for an English customer', async () => {
    const { sessions, templates, activities } = setup(update('en-IN'));
    await activities.deliverOutboxMessage('r1');
    expect(sessions).toEqual([]);
    expect(templates).toHaveLength(1);
  });

  it('is skipped, not turned into a chat message, after STOP', async () => {
    const { sessions, templates, writes, activities } = setup(update('mr-IN'), {
      optedOutAt: new Date(),
    });
    expect(await activities.deliverOutboxMessage('r1')).toBe('skipped');
    expect([...sessions, ...templates]).toEqual([]);
    expect(writes.at(-1)).toMatchObject({ status: 'skipped' });
  });

  it('is skipped when its switch in Settings is off', async () => {
    const { sessions, templates, activities } = setup(update('mr-IN'), {
      config: [{ key: 'project_milestone', active: false }],
    });
    expect(await activities.deliverOutboxMessage('r1')).toBe('skipped');
    expect([...sessions, ...templates]).toEqual([]);
  });

  it('falls back to the template when Meta says the window just closed', async () => {
    const { sessions, templates, writes, activities } = setup(update('mr-IN'), {
      sessionError: new PermanentSendError('re-engagement', WINDOW_CLOSED_CODE),
    });
    expect(await activities.deliverOutboxMessage('r1')).toBe('sent');
    expect(sessions).toEqual([]);
    expect(templates).toHaveLength(1);
    expect(writes.at(-1)).toMatchObject({ status: 'sent' });
  });

  it('leaves a template a person picked in the chat as it is', async () => {
    const picked = row(
      'service_update',
      { customer: 'Asha', topic: 'Visit', status: 'Booked', language: 'mr-IN' },
      'chat:abc',
    );
    const { sessions, templates, activities } = setup(picked);
    await activities.deliverOutboxMessage('r1');
    expect(sessions).toEqual([]);
    expect(templates).toHaveLength(1);
  });
});
