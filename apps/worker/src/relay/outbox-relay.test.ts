import type { Database } from '@oneohm/database';
import type { Client } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import { SENDING } from '../activities/delivery.activities';
import {
  DELIVERY_MAYBE_SENT,
  DELIVERY_STOPPED,
  nextPerRecipient,
  OutboxRelay,
} from './outbox-relay';

const stopped = vi.hoisted(() => [] as { id: string; reason: string }[]);
vi.mock('../activities/fail-delivery', () => ({
  failPendingDelivery: async (_db: unknown, id: string, reason: string) => {
    stopped.push({ id, reason });
  },
}));

interface Row {
  id: string;
  recipient: string;
  attempts: number;
  startedAt?: Date | null;
  createdAt?: Date;
  notBefore?: Date | null;
  lastError?: string | null;
}

/** Pending rows, oldest first, as the relay's query returns them. */
function fakeDb(pending: Row[]): Database {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () =>
      pending.map((row) => ({
        startedAt: null,
        createdAt: new Date(),
        notBefore: null,
        lastError: null,
        ...row,
      })),
  };
  return chain as unknown as Database;
}

/** A Temporal client that remembers started workflows, as a workflow ID would. */
function fakeClient() {
  const started: string[] = [];
  const client = {
    workflow: {
      start: async (_name: string, options: { workflowId: string; args: [string] }) => {
        if (started.includes(options.args[0]))
          throw new WorkflowExecutionAlreadyStartedError('started', options.workflowId, 'x');
        started.push(options.args[0]);
      },
    },
  };
  return { started, client: client as unknown as Client };
}

describe('OutboxRelay order per recipient', () => {
  it('starts a recipient’s second message only after the first one finishes', async () => {
    const pending: Row[] = [
      { id: 'a1', recipient: '+911', attempts: 0 },
      { id: 'a2', recipient: '+911', attempts: 0 },
    ];
    const { started, client } = fakeClient();
    const relay = new OutboxRelay(fakeDb(pending), client, 'q', 1000, () => {});

    await relay.tick();
    expect(started).toEqual(['a1']);

    // a1 is being sent (or waiting for a retry): a2 still waits.
    pending[0] = { id: 'a1', recipient: '+911', attempts: 1 };
    await relay.tick();
    expect(started).toEqual(['a1']);

    // a1 is done, so it is no longer pending.
    pending.shift();
    await relay.tick();
    expect(started).toEqual(['a1', 'a2']);
  });

  it('still sends to different recipients in parallel', async () => {
    const pending: Row[] = [
      { id: 'a1', recipient: '+911', attempts: 1 },
      { id: 'a2', recipient: '+911', attempts: 0 },
      { id: 'b1', recipient: '+912', attempts: 0 },
      { id: 'c1', recipient: '+913', attempts: 0 },
      { id: 'c2', recipient: '+913', attempts: 0 },
    ];
    const { started, client } = fakeClient();
    await new OutboxRelay(fakeDb(pending), client, 'q', 1000, () => {}).tick();
    expect(started).toEqual(['b1', 'c1']);
  });
});

describe('OutboxRelay in-flight rows block the whole recipient', () => {
  it('starts nothing for a recipient with a later row already in flight', async () => {
    const pending: Row[] = [
      { id: 'a1', recipient: '+911', attempts: 0 },
      { id: 'a2', recipient: '+911', attempts: 1, startedAt: new Date() },
      { id: 'b1', recipient: '+912', attempts: 0 },
    ];
    const { started, client } = fakeClient();
    await new OutboxRelay(fakeDb(pending), client, 'q', 1000, () => {}).tick();
    expect(started).toEqual(['b1']);
  });

  it('counts a started row as in flight even if attempts is still 0', () => {
    const rows = [
      { recipient: '+911', attempts: 0, startedAt: new Date() },
      { recipient: '+911', attempts: 0 },
    ];
    expect(nextPerRecipient(rows)).toEqual([]);
  });
});

describe('OutboxRelay stuck deliveries', () => {
  it('gives up a row stuck in flight for hours, so the next one can go', async () => {
    const longAgo = new Date(Date.now() - 6 * 3600_000);
    const pending: Row[] = [
      { id: 'a1', recipient: '+911', attempts: 3, startedAt: longAgo, createdAt: longAgo },
      { id: 'a2', recipient: '+911', attempts: 0 },
      { id: 'b1', recipient: '+912', attempts: 2, startedAt: new Date() },
      { id: 'b2', recipient: '+912', attempts: 0 },
    ];
    const { started, client } = fakeClient();
    await new OutboxRelay(fakeDb(pending), client, 'q', 1000, () => {}).tick();
    expect(stopped).toEqual([{ id: 'a1', reason: DELIVERY_STOPPED }]);
    expect(DELIVERY_STOPPED.toLowerCase()).toContain('delivery stopped — please resend');
    expect(started).toEqual(['a2']);
  });

  // Stuck mid-send: the provider may have it, so nobody is told to simply resend (A6).
  it('says a row stuck mid-send may have been sent', async () => {
    stopped.length = 0;
    const longAgo = new Date(Date.now() - 6 * 3600_000);
    const pending: Row[] = [
      { id: 'm1', recipient: '+914', attempts: 1, startedAt: longAgo, lastError: SENDING },
    ];
    const { client } = fakeClient();
    await new OutboxRelay(fakeDb(pending), client, 'q', 1000, () => {}).tick();
    expect(stopped).toEqual([{ id: 'm1', reason: DELIVERY_MAYBE_SENT }]);
    expect(DELIVERY_MAYBE_SENT).toContain('may have been sent — check before resending');
  });
});

describe('OutboxRelay held rows (step updates gathering into one message)', () => {
  const later = new Date(Date.now() + 60_000);
  const earlier = new Date(Date.now() - 1000);

  it('skips a row until its wait is over, without blocking the recipient’s other messages', async () => {
    const pending: Row[] = [
      { id: 'held', recipient: '+911', attempts: 0, notBefore: later },
      { id: 'pay', recipient: '+911', attempts: 0 },
      { id: 'only-held', recipient: '+912', attempts: 0, notBefore: later },
    ];
    const { started, client } = fakeClient();
    await new OutboxRelay(fakeDb(pending), client, 'q', 1000, () => {}).tick();
    expect(started).toEqual(['pay']);
  });

  it('starts the held row once its time has come', async () => {
    const pending: Row[] = [{ id: 'held', recipient: '+911', attempts: 0, notBefore: earlier }];
    const { started, client } = fakeClient();
    await new OutboxRelay(fakeDb(pending), client, 'q', 1000, () => {}).tick();
    expect(started).toEqual(['held']);
  });

  it('keeps one message at a time per recipient among the rows that are ready', () => {
    const rows = [
      { id: 'a', recipient: '+1', attempts: 0, notBefore: later },
      { id: 'b', recipient: '+1', attempts: 0, notBefore: null },
      { id: 'c', recipient: '+1', attempts: 0 },
    ];
    expect(nextPerRecipient(rows).map((row) => row.id)).toEqual(['b']);
    // The held one is the oldest ready row once its time passes.
    expect(nextPerRecipient(rows, new Date(later.getTime() + 1)).map((row) => row.id)).toEqual([
      'a',
    ]);
  });
});
