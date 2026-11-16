import { describe, expect, it } from 'vitest';
import type { DutyPoint } from './duty-point';
import { createDutyQueue, type DutyState, parseDutyState, type UploadAnswer } from './duty-queue';
import { QUEUE_CAP } from './duty-settings';

const point = (n: number): DutyPoint => ({
  id: `p${n}`,
  recordedAt: new Date(Date.UTC(2026, 10, 16, 4, 0, n)).toISOString(),
  latitude: 16.85,
  longitude: 74.58,
  mocked: false,
});
const many = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => point(from + i));
const memory = () => {
  const files = new Map<string, DutyState>();
  return {
    files,
    store: {
      load: async (userId: string) => files.get(userId) ?? { points: [], dropped: 0 },
      save: async (userId: string, state: DutyState) => {
        files.set(userId, state);
      },
    },
  };
};
const failure = (status: number) => Object.assign(new Error('x'), { status });
const takeAll = async (points: readonly DutyPoint[]): Promise<UploadAnswer> => ({
  accepted: points.length,
  rejected: [],
});

describe('the waiting route points', () => {
  it('keeps points per person and across a restart', async () => {
    const { store, files } = memory();
    const queue = createDutyQueue(store);
    await queue.add('u1', many(1, 3));
    await queue.add('u2', many(10, 1));
    expect(queue.waiting('u1')).toBe(3);
    expect(files.get('u2')?.points).toHaveLength(1);
    const again = createDutyQueue(store);
    await again.load('u1');
    expect(again.waiting('u1')).toBe(3);
    expect(again.waiting('u2')).toBe(0);
  });

  it('drops the oldest past the cap and counts them', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, QUEUE_CAP));
    await queue.add('u1', many(QUEUE_CAP, 7));
    expect(queue.waiting('u1')).toBe(QUEUE_CAP);
    expect(queue.dropped('u1')).toBe(7);
    const seen: string[] = [];
    await queue.flush(async (batch) => {
      seen.push(batch[0]?.id ?? '');
      return takeAll(batch);
    }, 'u1');
    expect(seen[0]).toBe('p7');
  });

  it('sends in batches of at most 200, oldest first, and empties the queue', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 450));
    const sizes: number[] = [];
    const result = await queue.flush(async (batch) => {
      sizes.push(batch.length);
      return takeAll(batch);
    }, 'u1');
    expect(sizes).toEqual([200, 200, 50]);
    expect(result).toMatchObject({ sent: 450, stalled: false, unauthorized: false });
    expect(queue.waiting('u1')).toBe(0);
  });

  it('removes rejected points too and reports why, once each', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 3));
    const result = await queue.flush(
      async () => ({
        accepted: 1,
        rejected: [
          { id: 'p1', reason: 'outside_duty' },
          { id: 'p2', reason: 'outside_duty' },
        ],
      }),
      'u1',
    );
    expect(result).toMatchObject({ sent: 1, reasons: ['outside_duty'] });
    expect(queue.waiting('u1')).toBe(0);
  });

  it('keeps everything when there is no signal, and says it is stalled', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 5));
    const result = await queue.flush(async () => Promise.reject(failure(0)), 'u1');
    expect(result).toMatchObject({ sent: 0, stalled: true });
    expect(queue.waiting('u1')).toBe(5);
  });

  it('keeps the points behind a batch that failed and sends the rest later', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 250));
    let calls = 0;
    const result = await queue.flush(async (batch) => {
      calls += 1;
      if (calls === 2) throw failure(503);
      return takeAll(batch);
    }, 'u1');
    expect(result).toMatchObject({ sent: 200, stalled: true });
    expect(queue.waiting('u1')).toBe(50);
  });

  it('halts on a 401 until resumed, without touching the points', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 2));
    expect((await queue.flush(async () => Promise.reject(failure(401)), 'u1')).unauthorized).toBe(
      true,
    );
    let called = false;
    const halted = await queue.flush(async (batch) => {
      called = true;
      return takeAll(batch);
    }, 'u1');
    expect(halted.unauthorized).toBe(true);
    expect(called).toBe(false);
    expect(queue.waiting('u1')).toBe(2);
    queue.resume();
    expect((await queue.flush(takeAll, 'u1')).sent).toBe(2);
  });

  it('halts one person only: a 401 for u1 does not stop u2', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 2));
    await queue.add('u2', many(10, 2));
    await queue.flush(async () => Promise.reject(failure(401)), 'u1');
    expect((await queue.flush(takeAll, 'u2')).sent).toBe(2);
    expect((await queue.flush(takeAll, 'u1')).unauthorized).toBe(true);
    queue.resume('u1');
    expect((await queue.flush(takeAll, 'u1')).sent).toBe(2);
  });

  it('on a 400 splits the batch in halves and drops only the bad point', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 8));
    const taken: string[] = [];
    const result = await queue.flush(async (batch) => {
      if (batch.some((item) => item.id === 'p5')) throw failure(400);
      taken.push(...batch.map((item) => item.id));
      return takeAll(batch);
    }, 'u1');
    expect(result).toMatchObject({ sent: 7, stalled: false });
    expect(taken.sort()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p6', 'p7']);
    expect(queue.waiting('u1')).toBe(0);
  });

  it('keeps what is left when a split batch meets no signal', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 4));
    let calls = 0;
    const result = await queue.flush(async (batch) => {
      calls += 1;
      if (calls === 1) throw failure(400);
      if (calls === 3) throw failure(0);
      return takeAll(batch);
    }, 'u1');
    expect(result).toMatchObject({ sent: 2, stalled: true });
    expect(queue.waiting('u1')).toBe(2);
  });

  it('drops a batch the server will never take, so it cannot block the rest', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 3));
    const result = await queue.flush(async () => Promise.reject(failure(400)), 'u1');
    expect(result.stalled).toBe(false);
    expect(queue.waiting('u1')).toBe(0);
  });

  it('joins a flush already running instead of sending twice', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 2));
    let calls = 0;
    const send = async (batch: readonly DutyPoint[]) => {
      calls += 1;
      return takeAll(batch);
    };
    await Promise.all([queue.flush(send, 'u1'), queue.flush(send, 'u1')]);
    expect(calls).toBe(1);
  });

  it('only sends the signed-in person’s points', async () => {
    const queue = createDutyQueue(memory().store);
    await queue.add('u1', many(0, 2));
    await queue.add('u2', many(10, 2));
    await queue.flush(takeAll, 'u1');
    expect(queue.waiting('u1')).toBe(0);
    expect(queue.waiting('u2')).toBe(2);
  });
});

describe('reading a saved file', () => {
  it('keeps good points and ignores damage', () => {
    expect(parseDutyState(null)).toEqual({ points: [], dropped: 0 });
    expect(parseDutyState({ points: [point(1), { id: 5 }, 'x'], dropped: 4 })).toEqual({
      points: [point(1)],
      dropped: 4,
    });
  });
});
