import { describe, expect, it } from 'vitest';
import { createTapQueue, lastQueued, outcomeOf, parseTaps, type QueuedTap } from './tap-queue';

const tap = (kind: 'in' | 'out', at = '2026-11-15T04:00:00.000Z', userId = 'u1'): QueuedTap => ({
  userId,
  kind,
  tappedAt: at,
  position: null,
});
const memory = (start: QueuedTap[] = []) => {
  const saved = { items: start };
  return {
    saved,
    store: {
      load: async () => saved.items,
      save: async (items: readonly QueuedTap[]) => {
        saved.items = [...items];
      },
    },
  };
};
const failure = (status: number) => Object.assign(new Error('x'), { status });

describe('what a failed send means', () => {
  it('stops the run on a 401', () => {
    expect(outcomeOf(failure(401))).toBe('unauthorized');
  });
  it('keeps the tap when there is no signal or the server is down', () => {
    expect(outcomeOf(new Error('Network request failed'))).toBe('retry');
    expect(outcomeOf(failure(0))).toBe('retry');
    expect(outcomeOf(failure(503))).toBe('retry');
  });
  it('counts already checked in or out as done', () => {
    expect(outcomeOf(failure(409))).toBe('done');
  });
  it('drops other refusals', () => {
    expect(outcomeOf(failure(400))).toBe('refused');
    expect(outcomeOf(failure(403))).toBe('refused');
  });
});

describe('the waiting taps', () => {
  it('keeps taps in order and across a restart', async () => {
    const { store, saved } = memory();
    const queue = createTapQueue(store);
    await queue.add(tap('in'));
    await queue.add(tap('out'));
    expect(saved.items.map((item) => item.kind)).toEqual(['in', 'out']);
    const again = createTapQueue(store);
    await again.load();
    expect(again.get()).toHaveLength(2);
    expect(lastQueued(again.get())).toBe('out');
  });

  it('sends in order and clears the queue', async () => {
    const { store, saved } = memory([tap('in'), tap('out')]);
    const queue = createTapQueue(store);
    const order: string[] = [];
    const result = await queue.flush(async (item) => order.push(item.kind), 'u1');
    expect(order).toEqual(['in', 'out']);
    expect(result.sent).toBe(2);
    expect(saved.items).toEqual([]);
  });

  it('stops at the first tap that still has no signal', async () => {
    const { store, saved } = memory([tap('in'), tap('out')]);
    const queue = createTapQueue(store);
    const result = await queue.flush(async () => {
      throw failure(0);
    }, 'u1');
    expect(result.sent).toBe(0);
    expect(saved.items).toHaveLength(2);
  });

  it('treats a repeat as success and reports a refusal', async () => {
    const { store, saved } = memory([tap('in'), tap('out')]);
    const queue = createTapQueue(store);
    const result = await queue.flush(async (item) => {
      throw failure(item.kind === 'in' ? 409 : 400);
    }, 'u1');
    expect(result.sent).toBe(0);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]?.tap.kind).toBe('out');
    expect(saved.items).toEqual([]);
  });

  it('never sends a tap twice when flushed at the same time', async () => {
    const { store } = memory([tap('in')]);
    const queue = createTapQueue(store);
    let calls = 0;
    const send = async () => {
      calls += 1;
      await Promise.resolve();
    };
    await Promise.all([queue.flush(send, 'u1'), queue.flush(send, 'u1')]);
    expect(calls).toBe(1);
  });
});

describe('taps of different people', () => {
  it('sends only the signed-in persons taps and leaves the rest untouched', async () => {
    const { store, saved } = memory([tap('in', undefined, 'u2'), tap('in', undefined, 'u1')]);
    const queue = createTapQueue(store);
    const sentFor: string[] = [];
    const result = await queue.flush(async (item) => sentFor.push(item.userId), 'u1');
    expect(sentFor).toEqual(['u1']);
    expect(result.sent).toBe(1);
    expect(saved.items.map((item) => item.userId)).toEqual(['u2']);
  });

  it('keeps a persons taps when they sign out and sends them at their next sign-in', async () => {
    const { store, saved } = memory();
    const queue = createTapQueue(store);
    await queue.add(tap('in', undefined, 'u1'));
    // Someone else signs in: u1's tap is never sent.
    const sent: string[] = [];
    await queue.flush(async (item) => sent.push(item.userId), 'u2');
    expect(sent).toEqual([]);
    expect(saved.items).toHaveLength(1);
    await queue.flush(async (item) => sent.push(item.userId), 'u1');
    expect(sent).toEqual(['u1']);
  });

  it('shows each person only their own waiting taps, as one stable list', async () => {
    const { store } = memory([tap('in', undefined, 'u1'), tap('out', undefined, 'u2')]);
    const queue = createTapQueue(store);
    await queue.load();
    expect(queue.mine('u1').map((item) => item.kind)).toEqual(['in']);
    expect(queue.mine('u1')).toBe(queue.mine('u1'));
    expect(queue.mine('u3')).toEqual([]);
  });

  it('never sends a tap saved before the owner was kept', () => {
    expect(parseTaps([{ kind: 'in', tappedAt: 'x', position: null }])[0]?.userId).toBe('');
  });
});

describe('a 401', () => {
  it('stops the run, keeps the tap and does not try again until resumed', async () => {
    const { store, saved } = memory([tap('in'), tap('out')]);
    const queue = createTapQueue(store);
    let calls = 0;
    const send = async () => {
      calls += 1;
      throw failure(401);
    };
    const first = await queue.flush(send, 'u1');
    expect(first.unauthorized).toBe(true);
    expect(calls).toBe(1);
    await queue.flush(send, 'u1');
    expect(calls).toBe(1);
    expect(saved.items).toHaveLength(2);
    queue.resume();
    await queue.flush(async () => undefined, 'u1');
    expect(saved.items).toEqual([]);
  });
});

describe('reading the saved file', () => {
  it('ignores anything that is not a tap', () => {
    expect(parseTaps({})).toEqual([]);
    expect(parseTaps([{ kind: 'x' }, tap('in')])).toEqual([tap('in')]);
  });
});
