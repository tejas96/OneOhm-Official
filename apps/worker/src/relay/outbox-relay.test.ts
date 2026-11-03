import type { Database } from '@oneohm/database';
import type { Client } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { describe, expect, it } from 'vitest';
import { OutboxRelay } from './outbox-relay';

interface Row {
  id: string;
  recipient: string;
  attempts: number;
}

/** Pending rows, oldest first, as the relay's query returns them. */
function fakeDb(pending: Row[]): Database {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => pending.map((row) => ({ ...row })),
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
