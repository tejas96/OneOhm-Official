import type { DatabaseExecutor } from '@oneohm/database';
import { describe, expect, it } from 'vitest';
import { queueFlowFallback } from './flow-fallback';
import { CHAT_WINDOW_CLOSED } from './send-checks';

/** Reads give the next result in turn; every insert is kept. */
function fakeDb(reads: unknown[][], conflict = false) {
  const inserted: unknown[] = [];
  const query = (result: unknown[]) => {
    const q = {
      from: () => q,
      where: () => q,
      values: (values: unknown) => {
        inserted.push(values);
        return q;
      },
      onConflictDoNothing: () => q,
      returning: async () => (conflict ? [] : [{ id: 'new-row' }]),
      // biome-ignore lint/suspicious/noThenProperty: a drizzle query is awaited as is.
      then: (done: (rows: unknown[]) => unknown) => Promise.resolve(result).then(done),
    };
    return q;
  };
  const db = {
    select: () => query(reads.shift() ?? []),
    insert: () => query([]),
  };
  return { inserted, db: db as unknown as DatabaseExecutor };
}

const flowRow = {
  id: 'f1',
  recipient: '+919800000000',
  template: 'session:flow',
  payload: { kind: 'flow', fallbackText: 'Send the photo here.' },
};

describe('a form message that could not be delivered', () => {
  it('queues its words as a plain chat message, once, and shows it in the chat', async () => {
    const { inserted, db } = fakeDb([[flowRow], [{ id: 'chat-1' }]]);
    await queueFlowFallback(db, 'f1', 'Meta refused');
    expect(inserted[0]).toMatchObject({
      template: 'session:text',
      payload: { kind: 'text', body: 'Send the photo here.' },
      dedupeKey: 'flow-fallback:f1',
    });
    expect(inserted[1]).toMatchObject({ conversationId: 'chat-1', body: 'Send the photo here.' });
  });

  it('does nothing for other messages, a closed window, or a fallback queued before', async () => {
    const other = fakeDb([[{ ...flowRow, template: 'session:text' }]]);
    await queueFlowFallback(other.db, 'f1', 'x');
    const closed = fakeDb([[flowRow]]);
    await queueFlowFallback(closed.db, 'f1', CHAT_WINDOW_CLOSED);
    const again = fakeDb([[flowRow], [{ id: 'chat-1' }]], true);
    await queueFlowFallback(again.db, 'f1', 'x');
    expect(other.inserted).toHaveLength(0);
    expect(closed.inserted).toHaveLength(0);
    expect(again.inserted).toHaveLength(1);
  });
});
